# Auto Client Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build-time scan of client code for `useTranslations(...)` namespaces so `IntlProvider` ships only the namespaces client components actually use (`clientMessages: "auto"`), with safe fallbacks for dynamic keys and npm packages.

**Architecture:** A pure scanner (`src/client_messages_scan/`) parses source files with the TypeScript compiler API and returns `{ namespaces, dynamicCalls }`. A Vite plugin (`auto_client_messages_plugin.ts`, wired into `cloudflareNextIntl()`) runs the scanner on `configResolved` and on HMR, then exposes the result via `define` as `__CFNI_CLIENT_MESSAGES__`. `server_provider.tsx` resolves `config.clientMessages === "auto"` to that manifest through `pickClientMessages`. Unresolvable dynamic calls fall back to configured `fallbackNamespaces`, or to sending everything (`onDynamic: "all"`, default) — never silently drop translations.

**Tech Stack:** TypeScript 5, `typescript` compiler API (already a peer dep), Vite plugin API, Vitest.

**Spec:** Pasted design discussion in the 2026-10-08 conversation (AST scan of client files, union/enum type inference, glob fallbacks, transpilePackages / package.json `i18n.namespaces` manifest). Runtime lazy-fetch (Variant В) is **out of scope** for this plan.

## Global Constraints

- Existing uncommitted work (`src/general/pick_client_messages.ts`, `clientMessages?: boolean | readonly string[]` in `src/types/types.ts`, server_provider wiring) is the base — extend it, don't replace it.
- Default behavior unchanged: `clientMessages` undefined ⇒ all messages sent.
- Namespace is top-level only: `useTranslations("Contact.validation")` ⇒ `"Contact"`.
- Over-inclusion is acceptable; under-inclusion is a bug (missing text in UI).
- No comments in code (repo rule). Targeted edits only. Use `rtk` prefix for CLI.
- Tests run with `rtk npx vitest run <path>` from `packages/cloudflare-next-intl`.

## Review Focus

1. Shared component **without** `'use client'` imported by a client file calls `useTranslations` → must still be included. Mitigation: scan **every** file importing `useTranslations` from `cloudflare-next-intl/use` (or `/client`), not only `'use client'` files. Tested in Task 1.
2. `useTranslations()` with no arg (root access) → must disable filtering (send all). Tested in Task 1.
3. Aliased import (`import { useTranslations as useT }`) → must be detected. Tested in Task 1.
4. Dev server: user adds a new namespace in a client file → manifest must update without restart. Tested in Task 4 (`handleHotUpdate`).
5. Namespace listed in manifest but missing from messages JSON → must not crash (`pickClientMessages` already skips). Tested in Task 5.

---

## File Structure

- Create `src/client_messages_scan/scan_file.ts` — parse one file's source, return namespaces + dynamic calls.
- Create `src/client_messages_scan/scan_project.ts` — walk dirs + packages, aggregate, apply fallbacks.
- Create `src/client_messages_scan/index.ts` — re-exports.
- Create `src/vite/auto_client_messages_plugin.ts` — Vite plugin, `define` injection.
- Modify `src/vite/plugin.ts` — `autoClientMessages?: boolean | AutoClientMessagesOptions`.
- Modify `src/types/types.ts` — `clientMessages?: boolean | "auto" | readonly string[]`.
- Modify `src/general/pick_client_messages.ts` — resolve `"auto"`.
- Modify `README.md`, `CHANGELOG.md`.
- Tests next to each file (`*.test.ts`).

---

### Task 1: Single-file scanner

**Files:**
- Create: `src/client_messages_scan/scan_file.ts`
- Test: `src/client_messages_scan/scan_file.test.ts`

**Interfaces:**
- Produces: `export interface FileScanResult { namespaces: string[]; dynamicCalls: { file: string; line: number; text: string }[]; usesRoot: boolean }` and `export function scanFile(file: string, code: string): FileScanResult`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { scanFile } from "./scan_file.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;

describe("scanFile", () => {
    it("extracts literal namespace and trims to top level", () => {
        const r = scanFile("a.tsx", `${imp}const t = useTranslations("Contact.validation"); const u = useTranslations('Auth');`);
        expect(r.namespaces.sort()).toEqual(["Auth", "Contact"]);
        expect(r.dynamicCalls).toEqual([]);
    });
    it("ignores files without the hook import", () => {
        expect(scanFile("a.tsx", `const t = useTranslations("X");`).namespaces).toEqual([]);
    });
    it("handles aliased import", () => {
        const r = scanFile("a.tsx", `import { useTranslations as useT } from "cloudflare-next-intl/use";\nuseT("Header");`);
        expect(r.namespaces).toEqual(["Header"]);
    });
    it("works without 'use client' directive", () => {
        expect(scanFile("shared.tsx", `${imp}export function A(){ useTranslations("Shared"); }`).namespaces).toEqual(["Shared"]);
    });
    it("flags root access", () => {
        expect(scanFile("a.tsx", `${imp}useTranslations();`).usesRoot).toBe(true);
    });
    it("resolves ternary and no-substitution template literals", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(x ? "A" : \`B\`);`);
        expect(r.namespaces.sort()).toEqual(["A", "B"]);
    });
    it("resolves local const string", () => {
        expect(scanFile("a.tsx", `${imp}const NS = "Footer"; useTranslations(NS);`).namespaces).toEqual(["Footer"]);
    });
    it("resolves union-typed parameter", () => {
        const r = scanFile("a.tsx", `${imp}type C = "food" | "drinks"; function X({c}:{c:C}){ useTranslations(c); }`);
        expect(r.namespaces.sort()).toEqual(["drinks", "food"]);
    });
    it("reports unresolvable dynamic call with line", () => {
        const r = scanFile("a.tsx", `${imp}\nuseTranslations(props.ns);`);
        expect(r.dynamicCalls).toEqual([{ file: "a.tsx", line: 2, text: "props.ns" }]);
    });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `rtk npx vitest run src/client_messages_scan/scan_file.test.ts` — Expected: FAIL "Cannot find module ./scan_file.js".

- [ ] **Step 3: Implement**

```ts
import ts from "typescript";

export interface DynamicCall { file: string; line: number; text: string }
export interface FileScanResult { namespaces: string[]; dynamicCalls: DynamicCall[]; usesRoot: boolean }

const HOOK_MODULES = new Set(["cloudflare-next-intl/use", "cloudflare-next-intl/client", "cloudflare-next-intl"]);

function topLevel(ns: string): string {
    return ns.split(".")[0];
}

function literalsOfType(node: ts.TypeNode | undefined, sf: ts.SourceFile, aliases: Map<string, ts.TypeNode>): string[] | null {
    if (!node) return null;
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
    if (ts.isUnionTypeNode(node)) {
        const out: string[] = [];
        for (const t of node.types) {
            const r = literalsOfType(t, sf, aliases);
            if (!r) return null;
            out.push(...r);
        }
        return out;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return literalsOfType(aliases.get(node.typeName.text), sf, aliases);
    return null;
}

export function scanFile(file: string, code: string): FileScanResult {
    const result: FileScanResult = { namespaces: [], dynamicCalls: [], usesRoot: false };
    if (!code.includes("useTranslations")) return result;
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const hookNames = new Set<string>();
    const consts = new Map<string, ts.Expression>();
    const typeAliases = new Map<string, ts.TypeNode>();
    const paramTypes = new Map<string, ts.TypeNode>();

    const collect = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && HOOK_MODULES.has(node.moduleSpecifier.text)) {
            const named = node.importClause?.namedBindings;
            if (named && ts.isNamedImports(named)) {
                for (const el of named.elements) if ((el.propertyName ?? el.name).text === "useTranslations") hookNames.add(el.name.text);
            }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) consts.set(node.name.text, node.initializer);
        if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node.type);
        if (ts.isParameter(node) && node.type) {
            if (ts.isIdentifier(node.name)) paramTypes.set(node.name.text, node.type);
            if (ts.isObjectBindingPattern(node.name) && ts.isTypeLiteralNode(node.type)) {
                for (const el of node.name.elements) {
                    if (!ts.isIdentifier(el.name)) continue;
                    const key = (el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName : el.name).text;
                    const member = node.type.members.find((m) => ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === key) as ts.PropertySignature | undefined;
                    if (member?.type) paramTypes.set(el.name.text, member.type);
                }
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(sf);
    if (hookNames.size === 0) return result;

    const resolve = (expr: ts.Expression, depth = 0): string[] | null => {
        if (depth > 5) return null;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
        if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return resolve(expr.expression, depth + 1);
        if (ts.isConditionalExpression(expr)) {
            const a = resolve(expr.whenTrue, depth + 1);
            const b = resolve(expr.whenFalse, depth + 1);
            return a && b ? [...a, ...b] : null;
        }
        if (ts.isIdentifier(expr)) {
            const init = consts.get(expr.text);
            if (init) return resolve(init, depth + 1);
            return literalsOfType(paramTypes.get(expr.text), sf, typeAliases);
        }
        return null;
    };

    const found = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && hookNames.has(node.expression.text)) {
            const arg = node.arguments[0];
            if (!arg) result.usesRoot = true;
            else {
                const values = resolve(arg);
                if (values) values.forEach((v) => found.add(topLevel(v)));
                else result.dynamicCalls.push({ file, line: sf.getLineAndCharacterOfPosition(arg.getStart()).line + 1, text: arg.getText() });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    result.namespaces = [...found];
    return result;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `rtk npx vitest run src/client_messages_scan/scan_file.test.ts` — Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

`rtk git add src/client_messages_scan && rtk git commit -m "feat: add useTranslations namespace file scanner"`

---

### Task 2: Project scanner (dirs, packages, fallbacks)

**Files:**
- Create: `src/client_messages_scan/scan_project.ts`, `src/client_messages_scan/index.ts`
- Test: `src/client_messages_scan/scan_project.test.ts`

**Interfaces:**
- Consumes: `scanFile` (Task 1)
- Produces:
  - `export interface ScanProjectOptions { root: string; dirs?: string[]; packages?: string[]; fallbackNamespaces?: string[]; onDynamic?: "all" | "fallback" }`
  - `export interface ClientMessagesManifest { namespaces: string[] | true; dynamicCalls: DynamicCall[]; scannedFiles: number }` — `true` means "send all".
  - `export function scanProject(opts: ScanProjectOptions): ClientMessagesManifest`
  - `export function matchesNamespacePattern(ns: string, pattern: string): boolean` (supports trailing `*`, e.g. `Categories*`).

Rules:
- `dirs` default `["src", "app", "components"]` (existing ones only), extensions `.ts .tsx .js .jsx .mjs`, skip `node_modules`, `dist`, `.next`, `*.test.*`.
- For each name in `packages`: read `node_modules/<pkg>/package.json`; if it has `i18n.namespaces: string[]` use that; otherwise scan the package dir files.
- Any `usesRoot` ⇒ `namespaces: true`.
- Any `dynamicCalls` and `onDynamic` (default `"all"`) is `"all"` ⇒ `namespaces: true`; `"fallback"` ⇒ add `fallbackNamespaces`.
- `fallbackNamespaces` are always added to the list; sorted, unique output.

- [ ] **Step 1: Write failing tests** (use `mkdtempSync` in `os.tmpdir()` and `writeFileSync` fixtures)

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject, matchesNamespacePattern } from "./scan_project.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;
function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "cfni-scan-"));
    for (const [p, c] of Object.entries(files)) {
        mkdirSync(join(root, p, ".."), { recursive: true });
        writeFileSync(join(root, p), c);
    }
    return root;
}

describe("scanProject", () => {
    it("aggregates namespaces across files, sorted and unique", () => {
        const root = fixture({ "src/a.tsx": `${imp}useTranslations("B");`, "src/b.tsx": `${imp}useTranslations("A"); useTranslations("B");` });
        expect(scanProject({ root }).namespaces).toEqual(["A", "B"]);
    });
    it("skips test files and node_modules", () => {
        const root = fixture({ "src/a.test.tsx": `${imp}useTranslations("T");`, "src/node_modules/x/a.tsx": `${imp}useTranslations("N");` });
        expect(scanProject({ root }).namespaces).toEqual([]);
    });
    it("root access sends all", () => {
        expect(scanProject({ root: fixture({ "src/a.tsx": `${imp}useTranslations();` }) }).namespaces).toBe(true);
    });
    it("dynamic call sends all by default", () => {
        expect(scanProject({ root: fixture({ "src/a.tsx": `${imp}useTranslations(p.ns);` }) }).namespaces).toBe(true);
    });
    it("dynamic call with onDynamic=fallback uses fallbackNamespaces", () => {
        const root = fixture({ "src/a.tsx": `${imp}useTranslations(p.ns); useTranslations("X");` });
        const m = scanProject({ root, onDynamic: "fallback", fallbackNamespaces: ["Common"] });
        expect(m.namespaces).toEqual(["Common", "X"]);
        expect(m.dynamicCalls).toHaveLength(1);
    });
    it("reads package.json i18n manifest", () => {
        const root = fixture({ "node_modules/@ui/kit/package.json": JSON.stringify({ name: "@ui/kit", i18n: { namespaces: ["Buttons"] } }) });
        expect(scanProject({ root, packages: ["@ui/kit"] }).namespaces).toEqual(["Buttons"]);
    });
    it("scans package source when no manifest", () => {
        const root = fixture({ "node_modules/kit/package.json": `{"name":"kit"}`, "node_modules/kit/dist/a.js": `${imp}useTranslations("Kit");` });
        expect(scanProject({ root, packages: ["kit"] }).namespaces).toEqual(["Kit"]);
    });
});

describe("matchesNamespacePattern", () => {
    it("matches exact and trailing wildcard", () => {
        expect(matchesNamespacePattern("Errors", "Errors")).toBe(true);
        expect(matchesNamespacePattern("CategoriesFood", "Categories*")).toBe(true);
        expect(matchesNamespacePattern("Other", "Categories*")).toBe(false);
    });
});
```

- [ ] **Step 2: Run, verify fail** — `rtk npx vitest run src/client_messages_scan/scan_project.test.ts`, Expected FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanFile, type DynamicCall } from "./scan_file.js";

export interface ScanProjectOptions { root: string; dirs?: string[]; packages?: string[]; fallbackNamespaces?: string[]; onDynamic?: "all" | "fallback" }
export interface ClientMessagesManifest { namespaces: string[] | true; dynamicCalls: DynamicCall[]; scannedFiles: number }

const EXT = /\.(tsx?|jsx?|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git"]);

export function matchesNamespacePattern(ns: string, pattern: string): boolean {
    return pattern.endsWith("*") ? ns.startsWith(pattern.slice(0, -1)) : ns === pattern;
}

function walk(dir: string, out: string[], skipNodeModules: boolean): void {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (SKIP_DIRS.has(name) && (skipNodeModules || name !== "dist")) continue;
            walk(full, out, skipNodeModules);
        } else if (EXT.test(name) && !/\.(test|spec|bench)\./.test(name) && !name.endsWith(".d.ts")) out.push(full);
    }
}

export function scanProject(opts: ScanProjectOptions): ClientMessagesManifest {
    const files: string[] = [];
    for (const d of opts.dirs ?? ["src", "app", "components"]) {
        const full = join(opts.root, d);
        if (existsSync(full)) walk(full, files, true);
    }
    const found = new Set<string>(opts.fallbackNamespaces ?? []);
    for (const pkg of opts.packages ?? []) {
        const pkgDir = join(opts.root, "node_modules", pkg);
        const pjPath = join(pkgDir, "package.json");
        if (!existsSync(pjPath)) continue;
        const pj = JSON.parse(readFileSync(pjPath, "utf8")) as { i18n?: { namespaces?: string[] } };
        if (Array.isArray(pj.i18n?.namespaces)) pj.i18n.namespaces.forEach((n) => found.add(n));
        else walk(pkgDir, files, false);
    }
    const dynamicCalls: DynamicCall[] = [];
    let usesRoot = false;
    for (const f of files) {
        const r = scanFile(f, readFileSync(f, "utf8"));
        r.namespaces.forEach((n) => found.add(n));
        dynamicCalls.push(...r.dynamicCalls);
        usesRoot ||= r.usesRoot;
    }
    const sendAll = usesRoot || (dynamicCalls.length > 0 && (opts.onDynamic ?? "all") === "all");
    return { namespaces: sendAll ? true : [...found].sort(), dynamicCalls, scannedFiles: files.length };
}
```

`index.ts`:

```ts
export { scanFile, type FileScanResult, type DynamicCall } from "./scan_file.js";
export { scanProject, matchesNamespacePattern, type ScanProjectOptions, type ClientMessagesManifest } from "./scan_project.js";
```

- [ ] **Step 4: Run, verify pass** — same command, Expected PASS.

- [ ] **Step 5: Commit** — `rtk git commit -am "feat: add project-wide client messages scanner"` (after `rtk git add src/client_messages_scan`).

---

### Task 3: `"auto"` + wildcard support in `pickClientMessages` and types

**Files:**
- Modify: `src/types/types.ts` (the `clientMessages` field added in working tree)
- Modify: `src/general/pick_client_messages.ts`
- Test: `src/general/pick_client_messages.test.ts`

**Interfaces:**
- Consumes: `matchesNamespacePattern` (Task 2)
- Produces: `clientMessages?: boolean | "auto" | readonly string[]`; global `declare const __CFNI_CLIENT_MESSAGES__: string[] | true | undefined` read via `typeof` guard; `pickClientMessages(messages, clientMessages, autoManifest = readAutoManifest())`.

- [ ] **Step 1: Add failing tests** to the existing test file

```ts
it("auto uses injected manifest", () => {
    expect(pickClientMessages({ A: {x:"1"}, B: {y:"2"} }, "auto", ["A"])).toEqual({ A: {x:"1"} });
});
it("auto with manifest true sends all", () => {
    const m = { A: {x:"1"} };
    expect(pickClientMessages(m, "auto", true)).toBe(m);
});
it("auto without manifest (plugin off) sends all", () => {
    const m = { A: {x:"1"} };
    expect(pickClientMessages(m, "auto", undefined)).toBe(m);
});
it("array supports trailing wildcard", () => {
    expect(pickClientMessages({ CatA: {}, CatB: {}, X: {} }, ["Cat*"])).toEqual({ CatA: {}, CatB: {} });
});
it("manifest namespace missing from messages is skipped", () => {
    expect(pickClientMessages({ A: {} }, "auto", ["A", "Gone"])).toEqual({ A: {} });
});
```

- [ ] **Step 2: Run, verify fail** — `rtk npx vitest run src/general/pick_client_messages.test.ts`.

- [ ] **Step 3: Implement**

In `types.ts` change the field to `clientMessages?: boolean | "auto" | readonly string[];` and extend its JSDoc with one line: "`"auto"` uses the namespace manifest generated by the `autoClientMessages` Vite plugin; array entries may end with `*`."

`pick_client_messages.ts`:

```ts
import type { TranslationObject } from "../types/types.js";
import { matchesNamespacePattern } from "../client_messages_scan/scan_project.js";

declare const __CFNI_CLIENT_MESSAGES__: string[] | true | undefined;

function readAutoManifest(): string[] | true | undefined {
    return typeof __CFNI_CLIENT_MESSAGES__ === "undefined" ? undefined : __CFNI_CLIENT_MESSAGES__;
}

export default function pickClientMessages(messages: TranslationObject, clientMessages: boolean | "auto" | readonly string[] | undefined, autoManifest: string[] | true | undefined = readAutoManifest()): TranslationObject {
    const list = clientMessages === "auto" ? autoManifest ?? true : clientMessages;
    if (list === undefined || list === true) return messages;
    const picked: TranslationObject = {};
    if (list === false) return picked;
    for (const namespace of Object.keys(messages)) {
        if (list.some((p) => matchesNamespacePattern(namespace, p))) picked[namespace] = messages[namespace];
    }
    return picked;
}
```

Note: `scan_project.ts` imports `node:fs`; to keep the runtime bundle clean, move `matchesNamespacePattern` into its own file `src/client_messages_scan/match_namespace.ts` and re-export it from `scan_project.ts` and `index.ts`. Import from `match_namespace.js` here.

- [ ] **Step 4: Run, verify pass** — also run `rtk npx vitest run src/server/components/server_provider.test.tsx` (existing).

- [ ] **Step 5: Commit** — `rtk git commit -am "feat: support auto and wildcard clientMessages"`.

---

### Task 4: Vite plugin `autoClientMessages`

**Files:**
- Create: `src/vite/auto_client_messages_plugin.ts`
- Modify: `src/vite/plugin.ts` (options interface + push next to `autoImageLoader` block ~line 236)
- Modify: `src/vite/index.ts` (export plugin + options type)
- Test: `src/vite/auto_client_messages_plugin.test.ts`

**Interfaces:**
- Consumes: `scanProject`, `ScanProjectOptions` (Task 2)
- Produces:
  - `export interface AutoClientMessagesOptions extends Partial<Omit<ScanProjectOptions, "root">> { root?: string; strict?: boolean }`
  - `export function autoClientMessagesPlugin(options?: AutoClientMessagesOptions): Plugin` named `"cloudflare-next-intl-auto-client-messages"`.
  - In `CloudflareNextIntlOptions`: `autoClientMessages?: boolean | AutoClientMessagesOptions;` — **opt-in** (default off: only pushed when truthy).

Behavior:
- `config()` hook: run `scanProject`, return `{ define: { __CFNI_CLIENT_MESSAGES__: JSON.stringify(manifest.namespaces) } }`.
- Print one line: `[cloudflare-next-intl] client messages: N namespaces from M files` or `... sending all (reason)`; list each dynamic call `file:line text`.
- `strict: true` + dynamic calls ⇒ throw `Error("[cloudflare-next-intl] Dynamic useTranslations namespaces found ...")`.
- `handleHotUpdate({ file, server })`: if file matches source ext and namespace set changed, rescan, update `server.config.define`, and `server.ws.send({ type: "full-reload" })`.

- [ ] **Step 1: Write failing tests**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { autoClientMessagesPlugin } from "./auto_client_messages_plugin.js";
import { cloudflareNextIntl } from "./plugin.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;
function root(code: string): string {
    const r = mkdtempSync(join(tmpdir(), "cfni-acm-"));
    mkdirSync(join(r, "src"));
    writeFileSync(join(r, "src/a.tsx"), code);
    return r;
}
const callConfig = (p: any) => (typeof p.config === "function" ? p.config({}, { command: "build", mode: "production" }) : p.config.handler({}, { command: "build" }));

describe("autoClientMessagesPlugin", () => {
    it("injects manifest via define", () => {
        const out = callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations("Auth");`) }));
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBe(JSON.stringify(["Auth"]));
    });
    it("injects true on dynamic call by default", () => {
        const out = callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations(p.x);`) }));
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBe("true");
    });
    it("strict throws on dynamic call", () => {
        expect(() => callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations(p.x);`), strict: true }))).toThrow(/Dynamic useTranslations/);
    });
    it("hot update rescans and reloads when namespaces change", () => {
        const r = root(`${imp}useTranslations("A");`);
        const p: any = autoClientMessagesPlugin({ root: r });
        callConfig(p);
        writeFileSync(join(r, "src/a.tsx"), `${imp}useTranslations("B");`);
        const server = { config: { define: {} as Record<string, string> }, ws: { send: vi.fn() } };
        p.handleHotUpdate({ file: join(r, "src/a.tsx"), server });
        expect(server.config.define.__CFNI_CLIENT_MESSAGES__).toBe(JSON.stringify(["B"]));
        expect(server.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
    });
    it("is off by default in cloudflareNextIntl()", () => {
        expect(cloudflareNextIntl().some((p) => p.name === "cloudflare-next-intl-auto-client-messages")).toBe(false);
        expect(cloudflareNextIntl({ autoClientMessages: true }).some((p) => p.name === "cloudflare-next-intl-auto-client-messages")).toBe(true);
    });
});
```

- [ ] **Step 2: Run, verify fail** — `rtk npx vitest run src/vite/auto_client_messages_plugin.test.ts`.

- [ ] **Step 3: Implement**

```ts
import type { Plugin } from "vite";
import { scanProject, type ScanProjectOptions, type ClientMessagesManifest } from "../client_messages_scan/scan_project.js";

export interface AutoClientMessagesOptions extends Partial<Omit<ScanProjectOptions, "root">> { root?: string; strict?: boolean }

const KEY = "__CFNI_CLIENT_MESSAGES__";
const SOURCE = /\.(tsx?|jsx?|mjs)$/;

export function autoClientMessagesPlugin(options: AutoClientMessagesOptions = {}): Plugin {
    let last = "";
    const run = (): string => {
        const manifest: ClientMessagesManifest = scanProject({ ...options, root: options.root ?? process.cwd() });
        for (const d of manifest.dynamicCalls) console.warn(`[cloudflare-next-intl] dynamic useTranslations: ${d.file}:${d.line} ${d.text}`);
        if (options.strict && manifest.dynamicCalls.length > 0) throw new Error("[cloudflare-next-intl] Dynamic useTranslations namespaces found. Use literals, union types, or fallbackNamespaces with onDynamic: \"fallback\".");
        console.log(manifest.namespaces === true
            ? `[cloudflare-next-intl] client messages: sending all (root or dynamic access) from ${manifest.scannedFiles} files`
            : `[cloudflare-next-intl] client messages: ${manifest.namespaces.length} namespaces from ${manifest.scannedFiles} files`);
        return JSON.stringify(manifest.namespaces);
    };
    return {
        name: "cloudflare-next-intl-auto-client-messages",
        config() {
            last = run();
            return { define: { [KEY]: last } };
        },
        handleHotUpdate({ file, server }) {
            if (!SOURCE.test(file)) return;
            const next = run();
            if (next === last) return;
            last = next;
            (server.config.define as Record<string, string>)[KEY] = next;
            server.ws.send({ type: "full-reload" });
        },
    };
}
```

In `plugin.ts` add to `CloudflareNextIntlOptions`:

```ts
    /**
     * Scan `useTranslations(...)` calls at build time and ship only those namespaces to the client.
     * Requires `clientMessages: "auto"` in the intl config. Off by default.
     */
    autoClientMessages?: boolean | AutoClientMessagesOptions;
```

and after the `autoImageLoader` block:

```ts
    if (options.autoClientMessages) {
        plugins.push(autoClientMessagesPlugin(typeof options.autoClientMessages === "object" ? { root: options.root, ...options.autoClientMessages } : { root: options.root }));
    }
```

(Repo rule says no code comments; JSDoc on public options matches the existing file's style, so keep it.)

- [ ] **Step 4: Run, verify pass** — plus `rtk npx vitest run src/vite/plugin.test.ts src/vite/plugin_order_integration.test.ts`.

- [ ] **Step 5: Commit** — `rtk git commit -am "feat: add autoClientMessages vite plugin"`.

---

### Task 5: Full package verification + docs

**Files:**
- Modify: `README.md` (section under client messages), `CHANGELOG.md` (Unreleased: `feat: clientMessages "auto" + autoClientMessages vite plugin`), `package.json` version bump `0.10.28`.
- Modify: `.agent/.sub-rules/packages/*.md` entry for cloudflare-next-intl (repo agent-doc convention) — one bullet describing the feature.

- [ ] **Step 1:** README snippet (≤10 lines): `cloudflareNextIntl({ autoClientMessages: { fallbackNamespaces: ["Common"], onDynamic: "fallback", packages: ["@my/ui"] } })` + `clientMessages: "auto"` in intl config + note about `package.json` `"i18n": { "namespaces": [...] }` for library authors.
- [ ] **Step 2:** `rtk npm test` — Expected: all pass, coverage thresholds met.
- [ ] **Step 3:** `rtk npm run build` — Expected: `dist/src/client_messages_scan/*.js` exists; `rtk grep -l "node:fs" dist/src/general/pick_client_messages.js` returns nothing.
- [ ] **Step 4:** `rtk npx tsc --noEmit` and `rtk npx eslint src` — clean.
- [ ] **Step 5: Commit** — `rtk git commit -am "docs: document auto client messages"`.

---

### Task 6: Real-project test — inflalite

Project: `/Volumes/External/own_projects/inflalite` (uses `cloudflare-next-intl ^0.10.24`, vite config `vite.config.ts:17`).

- [ ] **Step 1: Link local package.** In the package dir: `rtk npm run build && rtk npm pack` → produces `cloudflare-next-intl-0.10.28.tgz`. In inflalite: `rtk npm i /Volumes/External/own_projects/cloudflare-next-intl/packages/cloudflare-next-intl/cloudflare-next-intl-0.10.28.tgz` (tarball, not `npm link`, so vite dep-optimizer + single React copy behave like a real install). Do **not** commit inflalite's `package.json`/lockfile changes.
- [ ] **Step 2: Baseline.** Before enabling: `rtk npm run build`, start preview (`rtk npm run preview` or `wrangler dev` per project scripts), open `/en` with chrome-devtools MCP, run `evaluate_script` to measure size of the serialized messages in the RSC payload (`document.documentElement.outerHTML.length` and search for a known server-only namespace key, e.g. a key used only in a server page). Record numbers.
- [ ] **Step 3: Enable.** In `vite.config.ts` add `autoClientMessages: { onDynamic: "fallback", fallbackNamespaces: [] }` to `cloudflareNextIntl({...})`; in the intl config add `clientMessages: "auto"`.
- [ ] **Step 4: Build output check.** `rtk npm run build` — log shows `client messages: N namespaces from M files` and lists any dynamic calls. Compare N against `rtk grep -rhoE 'useTranslations\("[^".]+' src | sort -u` count. Fix each reported dynamic call either by adding to `fallbackNamespaces` or typing as union.
- [ ] **Step 5: Runtime check.** Preview again; visit every top-level route (`/[locale]`, `/[locale]/inflation`, `/[locale]/articles`, `/[locale]/auth`, profile/feedback pages) in at least 2 locales. For each: `list_console_messages` must show no `MISSING_MESSAGE` / next-intl errors and no hydration warnings; `take_screenshot` and confirm no raw keys (`Namespace.key`) rendered. Exercise client interactions that render translated text (form validation errors on `FeedbackPage` — `Contact.validation`, delete-account dialog, auth forms).
- [ ] **Step 6: Size check.** Re-measure payload from Step 2; server-only namespace must be absent from HTML. Record the before/after delta.
- [ ] **Step 7: Dev HMR check.** `rtk npm run dev`, add `useTranslations("SomeNewNs")` to a client component → page full-reloads and the namespace appears in payload. Revert.
- [ ] **Step 8:** Revert inflalite changes (`rtk git checkout -- . ` in inflalite only after confirming with the user) or leave on a branch `test/auto-client-messages` per user's choice.

### Task 7: Real-project test — CRV

Project: `/Volumes/External/clarivant/CRV` (uses `cloudflare-next-intl ^0.10.27`, vite config `vite.config.ts:21`).

- [ ] **Step 1:** Install the same tarball as Task 6 Step 1 into CRV.
- [ ] **Step 2:** Baseline build + preview, measure payload as Task 6 Step 2 (logged-out and logged-in pages; `(auth)` routes).
- [ ] **Step 3:** Enable `autoClientMessages: { onDynamic: "fallback", fallbackNamespaces: [] }` and `clientMessages: "auto"`.
- [ ] **Step 4:** Build; review dynamic-call warnings; check any UI-kit/shared packages CRV imports that call `useTranslations` — add them to `packages: [...]`.
- [ ] **Step 5:** Runtime pass over all `[locale]` routes incl. `(auth)` flows (login, register, reset), dashboards, forms with validation, toasts/error boundaries (cookie consent banner, errors board). Zero console i18n errors, zero raw keys, zero hydration warnings.
- [ ] **Step 6:** Run CRV's own test suite (`rtk npm test`) and e2e if present (`rtk npx playwright test`) with the plugin enabled — Expected: same pass count as baseline.
- [ ] **Step 7:** Size before/after recorded; revert or branch as in Task 6 Step 8.

### Task 8: Report

- [ ] Summarize per project: namespaces before/after, payload bytes before/after, dynamic calls found and how resolved, any bug found (fix in package with a new failing test first, then re-run Tasks 6–7).
