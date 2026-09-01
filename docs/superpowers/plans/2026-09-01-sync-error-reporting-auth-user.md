# Sync Error-Reporting Auth User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a whole-app companion pass, `syncErrorReportingAuthUser`, that auto-inserts `useAuthUser: true` into `reportError(config, { ... })` call sites reached *only* from pages `checkDynamicPages` already knows are `force-dynamic` — so those reports get the signed-in user for free — while leaving any call reachable from a static (or status-unknown) page untouched, since flipping it there would make `resolveErrorReportingUser` call `getAuthUser()`/`cookies()` on a request this package can't prove is safe to make dynamic.

**Architecture:** Extract the BFS local-import-graph walk already inside `traceDynamicUsage` into its own `collectReachableFiles` helper (pure refactor, existing tests unchanged) so a new whole-app pass can reuse the identical traversal. That pass computes, for every page, a `force-dynamic` / `not-confirmed-dynamic` status from the same rules `checkDynamicPages` itself uses, unions each status bucket's reachable-file sets, and only touches a `reportError()` call site whose file lands exclusively in the `force-dynamic` bucket. A small text-based call-site parser (`findReportErrorCalls`, same brace-depth-tracking style as `insertDynamicExport`) locates where to insert the property and detects an already-explicit `useAuthUser` to never overwrite it.

**Tech Stack:** TypeScript, Vitest, Node `fs`/`path`.

**Spec:** No separate spec doc — driven directly from the conversation: `checkDynamicPages` v0.9.14 added transitive dynamic-signal tracing (finds `getAuthUser()`/`useAuthUser()`/`withUserDb()` reachable from a page); v0.9.15 added `resolveErrorReportingUser(useAuthUser?)` (`cloudflare-next-intl/resolveOptionalAuthUser`) so an `onError` sink's user-attach read defaults off and stays invisible to that scan; this plan is the follow-up the user asked for — auto-flip that opt-in `true` for call sites reached only from routes that are dynamic anyway, "done by script what check which route is dynamic or static", rather than requiring a hand-edited `useAuthUser: true` per call site.

## Global Constraints

- Text-based heuristics only — no TypeScript compiler API dependency (existing project constraint).
- Every new pass follows the existing `CheckDynamicPagesIo`-style dependency injection (`readFile`/`writeFile`/`isFile`/`findPageFiles`) so tests stay fs-free.
- Conservative by construction: a call this new parser can't confidently classify (not a plain object-literal second argument, or one that already sets `useAuthUser`) is left untouched — never guessed at.
- A file reachable from even one page whose status isn't confirmed `force-dynamic` never gets rewritten, even if it's also reachable from a confirmed-dynamic page — ambiguous reachability always loses to safety.
- This pass is a bigger blast radius than `checkDynamicPages`'s own top-of-file export insertion (it mutates arbitrary call-site argument objects across the app), so it is **opt-in** everywhere: a new `syncErrorReportingAuthUser?: boolean` option, defaulting to `false`, on both `checkDynamicPages` and the `autoDynamicPages` Vite plugin.
- Traversal stays bounded (cycle-safe, capped) — reuse the existing `MAX_FILES_VISITED` cap via the extracted `collectReachableFiles`, never re-implement it.

---

## File Structure

- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.ts` — add `readExplicitDynamicValue`.
- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts` — tests for it.
- Create: `package/src/dynamic_pages_check/collect_reachable_files.ts` — the extracted BFS local-import-graph walk.
- Create: `package/src/dynamic_pages_check/collect_reachable_files.test.ts`
- Modify: `package/src/dynamic_pages_check/trace_dynamic_usage.ts` — rebuilt on top of `collectReachableFiles`; behavior-preserving refactor, its existing test file is untouched.
- Create: `package/src/dynamic_pages_check/find_report_error_calls.ts` — locates `reportError()` call sites and their insertion points.
- Create: `package/src/dynamic_pages_check/find_report_error_calls.test.ts`
- Create: `package/src/dynamic_pages_check/sync_error_reporting_auth_user.ts` — the whole-app pass.
- Create: `package/src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts`
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.ts` — `syncErrorReportingAuthUser` option, wired in after the main per-page loop.
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.test.ts` — integration tests for the wiring.
- Modify: `package/src/vite/auto_dynamic_pages_plugin.ts` — passthrough option (default `false`).
- Modify: `package/src/vite/auto_dynamic_pages_plugin.test.ts` — passthrough test.
- Modify: `package/README.md` — document the new pass and option.
- Modify: `package/CHANGELOG.md`, `package/package.json` — version bump + changelog entry.

---

### Task 1: `readExplicitDynamicValue`

**Files:**
- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.ts`
- Test: `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts`

**Interfaces:**
- Produces: `readExplicitDynamicValue(sourceText: string): 'force-static' | 'force-dynamic' | 'auto' | 'error' | null` — the literal string value of an `export const dynamic = '...'`, or `null` when there isn't one or its value isn't one of Next's four recognized literals.

- [ ] **Step 1: Write the failing tests**

Add to `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts`, inside the existing `describe('detectDynamicUsage', ...)` block (the new function is a sibling export from the same file, so it's fine to test it in the same file — add a second top-level `describe`):

```ts
describe('readExplicitDynamicValue', () => {
    it('reads a force-dynamic export', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "force-dynamic";`)).toBe('force-dynamic');
    });

    it('reads a force-static export with single quotes', () => {
        expect(readExplicitDynamicValue(`export const dynamic = 'force-static';`)).toBe('force-static');
    });

    it('reads auto and error', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "auto";`)).toBe('auto');
        expect(readExplicitDynamicValue(`export const dynamic = "error";`)).toBe('error');
    });

    it('returns null when there is no explicit export', () => {
        expect(readExplicitDynamicValue(`export default function Page() {}`)).toBeNull();
    });

    it('returns null for an unrecognized literal value', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "not-a-real-value";`)).toBeNull();
    });
});
```

Update the file's import line to include the new export:

```ts
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: FAIL — `readExplicitDynamicValue` is not exported yet.

- [ ] **Step 3: Add the implementation**

In `package/src/dynamic_pages_check/detect_dynamic_usage.ts`, add below the existing `const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;` line:

```ts
const EXPLICIT_DYNAMIC_EXPORT_VALUE = /export\s+const\s+dynamic\s*=\s*['"]([^'"]+)['"]/;

/**
 * Reads the literal string value of an explicit `export const dynamic =
 * '...'`, or `null` when there isn't one, or its value isn't one of Next's
 * four recognized literals (`force-static`/`force-dynamic`/`auto`/`error`)
 * — e.g. a non-literal expression this text scan can't evaluate.
 */
export function readExplicitDynamicValue(sourceText: string): 'force-static' | 'force-dynamic' | 'auto' | 'error' | null {
    const match = EXPLICIT_DYNAMIC_EXPORT_VALUE.exec(sourceText);
    if (match === null) return null;
    const value = match[1];
    if (value === 'force-static' || value === 'force-dynamic' || value === 'auto' || value === 'error') return value;
    return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/detect_dynamic_usage.ts package/src/dynamic_pages_check/detect_dynamic_usage.test.ts
git commit -m "feat: add readExplicitDynamicValue to detect_dynamic_usage"
```

---

### Task 2: Extract `collectReachableFiles`

**Files:**
- Create: `package/src/dynamic_pages_check/collect_reachable_files.ts`
- Test: `package/src/dynamic_pages_check/collect_reachable_files.test.ts`
- Modify: `package/src/dynamic_pages_check/trace_dynamic_usage.ts` (rebuilt on top of it — behavior-preserving)

**Interfaces:**
- Consumes: `extractImportSpecifiers`, `resolveLocalImport`, `AliasConfig` from `./resolve_local_imports.js` (already exist).
- Produces:
  - `interface CollectReachableFilesIo { readFile: (file: string) => string; isFile?: (file: string) => boolean }`
  - `const MAX_FILES_VISITED = 300` (exported)
  - `collectReachableFiles(entryFile: string, entrySource: string, aliases: readonly AliasConfig[], io: CollectReachableFilesIo): Map<string, string>` — every file reached from `entryFile` (itself included, inserted first so `Map` iteration order puts it first), mapped to its source text.
- `trace_dynamic_usage.ts`'s existing `TraceDynamicUsageIo`/`traceDynamicUsage` signatures are unchanged — only their internal implementation moves onto `collectReachableFiles`. `trace_dynamic_usage.test.ts` is NOT modified by this task; it must keep passing unchanged as the regression check that the refactor preserves behavior exactly.

- [ ] **Step 1: Write the failing tests**

Create `package/src/dynamic_pages_check/collect_reachable_files.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectReachableFiles } from './collect_reachable_files.js';

const ALIASES = [{ prefix: '@/', replacement: '/repo/src/' }];

function makeIo(files: Record<string, string>) {
    return {
        readFile: (file: string) => {
            const source = files[file];
            if (source === undefined) throw new Error(`no such file: ${file}`);
            return source;
        },
        isFile: (file: string) => file in files,
    };
}

describe('collectReachableFiles', () => {
    it('always includes the entry file, even with no imports', () => {
        const files = collectReachableFiles('/repo/src/app/page.tsx', 'export default function Page() {}', [], makeIo({}));
        expect([...files.keys()]).toEqual(['/repo/src/app/page.tsx']);
        expect(files.get('/repo/src/app/page.tsx')).toBe('export default function Page() {}');
    });

    it('follows a relative import', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'export const x = 1;',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('follows an alias-prefixed import', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "@/shared/util";',
            '/repo/src/shared/util.ts': 'export const x = 1;',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], ALIASES, makeIo(map));
        expect(files.has('/repo/src/shared/util.ts')).toBe(true);
    });

    it('does not open a bare package specifier', () => {
        const readFile = (file: string) => {
            throw new Error(`should not read: ${file}`);
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', 'import "zod";', [], { readFile, isFile: () => false });
        expect([...files.keys()]).toEqual(['/repo/src/app/page.tsx']);
    });

    it('is cycle-safe (a imports b, b imports a)', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'import "./page";',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('stops at MAX_FILES_VISITED without throwing', () => {
        const FILE_COUNT = 320;
        const map: Record<string, string> = {
            '/repo/src/app/page.tsx': Array.from({ length: FILE_COUNT }, (_, i) => `import "./leaf_${i}";`).join('\n'),
        };
        for (let i = 0; i < FILE_COUNT; i++) map[`/repo/src/app/leaf_${i}.ts`] = 'export const x = 1;';
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.size).toBeLessThanOrEqual(300);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/collect_reachable_files.test.ts`
Expected: FAIL — module `./collect_reachable_files.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `package/src/dynamic_pages_check/collect_reachable_files.ts`:

```ts
import { extractImportSpecifiers, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';

export interface CollectReachableFilesIo {
    readFile: (file: string) => string;
    isFile?: (file: string) => boolean;
}

/**
 * Safety cap on how many local files one entry point's import graph can
 * pull in before traversal stops. A runaway or accidentally-cyclic graph
 * should degrade to "some files possibly missed", never to a full-project
 * scan.
 */
export const MAX_FILES_VISITED = 300;

/**
 * Walks `entryFile`'s local (relative/alias) import graph — cycle-safe,
 * capped at {@link MAX_FILES_VISITED} — and returns every file reached,
 * `entryFile` included (inserted first, so callers that care about
 * iteration order can rely on it coming first), mapped to its source text.
 * Shared by `traceDynamicUsage` (unions `detectDynamicUsage` signals across
 * this set) and `syncErrorReportingAuthUser` (finds `reportError()` calls
 * across this set) so both walk the exact same graph by construction.
 */
export function collectReachableFiles(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: CollectReachableFilesIo,
): Map<string, string> {
    const isFile = io.isFile ?? (() => false);
    const files = new Map<string, string>([[entryFile, entrySource]]);
    const queue: string[] = [entryFile];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (files.size >= MAX_FILES_VISITED) continue;
        const source = files.get(current)!;

        for (const specifier of extractImportSpecifiers(source)) {
            if (files.size >= MAX_FILES_VISITED) break;
            const resolved = resolveLocalImport(specifier, current, aliases, isFile);
            if (resolved === null || files.has(resolved)) continue;

            let importedSource: string;
            try {
                importedSource = io.readFile(resolved);
            } catch {
                continue;
            }
            files.set(resolved, importedSource);
            queue.push(resolved);
        }
    }

    return files;
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/collect_reachable_files.test.ts`
Expected: PASS

- [ ] **Step 5: Rebuild `trace_dynamic_usage.ts` on top of it**

Replace the full contents of `package/src/dynamic_pages_check/trace_dynamic_usage.ts` with:

```ts
import { detectDynamicUsage, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { collectReachableFiles, type CollectReachableFilesIo } from './collect_reachable_files.js';
import type { AliasConfig } from './resolve_local_imports.js';

export type TraceDynamicUsageIo = CollectReachableFilesIo;

/**
 * Same signal `detectDynamicUsage` finds in one file, but unioned across
 * that file's local (relative/alias) import graph (via
 * `collectReachableFiles`): a page whose own text looks static can still
 * depend — through an imported component or repository, several hops
 * away — on a call that reaches `cookies()` or a dynamic-wrapping helper,
 * invisible to a single-file scan. Only same-project files are opened; a
 * specifier that resolves to neither a relative path nor a configured
 * alias (an npm package) is left as opaque text, matching
 * `detectDynamicUsage`'s own text-only, no-compiler-API design.
 */
export function traceDynamicUsage(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: TraceDynamicUsageIo,
): DynamicDetectionResult {
    const files = collectReachableFiles(entryFile, entrySource, aliases, io);

    let hasExplicitDynamicExport = false;
    const detectedApis = new Set<string>();
    let first = true;
    for (const source of files.values()) {
        const detection = detectDynamicUsage(source);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.detectedDynamicApis.forEach((api) => detectedApis.add(api));
    }

    return { hasExplicitDynamicExport, detectedDynamicApis: [...detectedApis] };
}
```

- [ ] **Step 6: Run `trace_dynamic_usage.test.ts` UNCHANGED to confirm the refactor is behavior-preserving**

Run: `cd package && npx vitest run src/dynamic_pages_check/trace_dynamic_usage.test.ts`
Expected: PASS — every test from before the refactor still passes with zero test-file edits. This is the regression check for Step 5; if anything fails here, the refactor changed behavior and must be fixed before moving on.

- [ ] **Step 7: Commit**

```bash
git add package/src/dynamic_pages_check/collect_reachable_files.ts package/src/dynamic_pages_check/collect_reachable_files.test.ts package/src/dynamic_pages_check/trace_dynamic_usage.ts
git commit -m "refactor: extract collectReachableFiles from traceDynamicUsage"
```

---

### Task 3: `findReportErrorCalls`

**Files:**
- Create: `package/src/dynamic_pages_check/find_report_error_calls.ts`
- Test: `package/src/dynamic_pages_check/find_report_error_calls.test.ts`

**Interfaces:**
- Produces:
  - `interface ReportErrorCall { insertPos: number | null; hasExplicitUseAuthUser: boolean }`
  - `findReportErrorCalls(sourceText: string): ReportErrorCall[]`

- [ ] **Step 1: Write the failing tests**

Create `package/src/dynamic_pages_check/find_report_error_calls.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findReportErrorCalls } from './find_report_error_calls.js';

describe('findReportErrorCalls', () => {
    it('returns an empty array when there is no reportError call', () => {
        expect(findReportErrorCalls('export default function Page() {}')).toEqual([]);
    });

    it('finds a single-line call and locates the insertion point right after the opening brace', () => {
        const source = `void reportError(intlConfig, { error, classOrMethodName: 'X' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.hasExplicitUseAuthUser).toBe(false);
        expect(call.insertPos).not.toBeNull();
        expect(source.slice(call.insertPos!, call.insertPos! + 1)).not.toBe('{');
        // The character immediately before insertPos is the object literal's opening brace.
        expect(source[call.insertPos! - 1]).toBe('{');
    });

    it('finds a multi-line call', () => {
        const source = `
reportError(cfg, {
    error,
    classOrMethodName: 'X',
    params: { foo: () => { return 1; } },
});
`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('detects an already-explicit useAuthUser and never proposes overwriting it', () => {
        const source = `reportError(cfg, { error, useAuthUser: true });`;
        const calls = findReportErrorCalls(source);
        expect(calls[0].hasExplicitUseAuthUser).toBe(true);
    });

    it('returns insertPos null when the second argument is not a plain object literal', () => {
        const source = `reportError(cfg, buildParams(x));`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).toBeNull();
    });

    it('is not confused by braces/commas inside string literals', () => {
        const source = `reportError(cfg, { classOrMethodName: 'a, b { c }' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('correctly skips a first argument that is itself an object literal', () => {
        const source = `reportError({ foo: 1 }, { classOrMethodName: 'x' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
    });

    it('finds multiple calls in one file independently', () => {
        const source = `
reportError(cfg, { classOrMethodName: 'a' });
reportError(cfg, { classOrMethodName: 'b', useAuthUser: false });
`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(2);
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
        expect(calls[1].hasExplicitUseAuthUser).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/find_report_error_calls.test.ts`
Expected: FAIL — module `./find_report_error_calls.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `package/src/dynamic_pages_check/find_report_error_calls.ts`:

```ts
export interface ReportErrorCall {
    /**
     * Index in the source text right after the `{` that opens the second
     * argument's object literal — the spot to insert `useAuthUser: true, `.
     * `null` when the second argument isn't a plain object literal (a bare
     * identifier, a function call building it elsewhere, `undefined`, ...)
     * — such a call is left alone by any caller.
     */
    insertPos: number | null;
    /**
     * Whether `useAuthUser` already appears as an identifier inside the
     * second argument's text. When `true`, leave this call alone even if
     * `insertPos` is non-null, so an explicit `useAuthUser: false` (or a
     * variable named `useAuthUser` passed via shorthand) is never
     * overwritten.
     */
    hasExplicitUseAuthUser: boolean;
}

const REPORT_ERROR_CALL = /\breportError\s*\(/g;

/**
 * Finds every `reportError(config, params)` call in a file's text and
 * locates where a `useAuthUser: true,` property could be inserted into its
 * second argument. Text-based, same heuristic class as the rest of this
 * module: tracks bracket depth across all three bracket kinds together
 * (matching `insertDynamicExport`'s own simplification) and skips over
 * string/template literals and comments so a comma or brace inside one
 * never miscounts. Deliberately conservative — any call shape this can't
 * confidently parse is returned with `insertPos: null`.
 */
export function findReportErrorCalls(sourceText: string): ReportErrorCall[] {
    const calls: ReportErrorCall[] = [];
    REPORT_ERROR_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REPORT_ERROR_CALL.exec(sourceText)) !== null) {
        calls.push(parseCallArgs(sourceText, match.index + match[0].length));
    }
    return calls;
}

function parseCallArgs(sourceText: string, start: number): ReportErrorCall {
    let depth = 1; // already inside the call's own opening '('
    let i = start;
    let firstArgEnd = -1; // index of the top-level comma separating arg1 from arg2
    let callEnd = -1; // index of the call's closing ')'

    while (i < sourceText.length && callEnd === -1) {
        const ch = sourceText[i];

        if (ch === '"' || ch === "'" || ch === '`') {
            i = skipStringLiteral(sourceText, i, ch);
            continue;
        }
        if (ch === '/' && sourceText[i + 1] === '/') {
            const nextNewline = sourceText.indexOf('\n', i);
            i = nextNewline === -1 ? sourceText.length : nextNewline;
            continue;
        }
        if (ch === '/' && sourceText[i + 1] === '*') {
            const end = sourceText.indexOf('*/', i + 2);
            i = end === -1 ? sourceText.length : end + 2;
            continue;
        }

        if (ch === '(' || ch === '{' || ch === '[') {
            depth += 1;
        } else if (ch === ')' || ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
                callEnd = i;
                break;
            }
        } else if (ch === ',' && depth === 1 && firstArgEnd === -1) {
            firstArgEnd = i;
        }

        i += 1;
    }

    if (firstArgEnd === -1 || callEnd === -1) {
        return { insertPos: null, hasExplicitUseAuthUser: false };
    }

    const paramsText = sourceText.slice(firstArgEnd + 1, callEnd);
    const hasExplicitUseAuthUser = /\buseAuthUser\b/.test(paramsText);
    const leadingWhitespace = paramsText.length - paramsText.trimStart().length;
    const paramsStart = firstArgEnd + 1 + leadingWhitespace;

    if (sourceText[paramsStart] !== '{') {
        return { insertPos: null, hasExplicitUseAuthUser };
    }

    return { insertPos: paramsStart + 1, hasExplicitUseAuthUser };
}

function skipStringLiteral(sourceText: string, start: number, quote: string): number {
    let i = start + 1;
    while (i < sourceText.length) {
        if (sourceText[i] === '\\') {
            i += 2;
            continue;
        }
        if (sourceText[i] === quote) return i + 1;
        i += 1;
    }
    return sourceText.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/find_report_error_calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/find_report_error_calls.ts package/src/dynamic_pages_check/find_report_error_calls.test.ts
git commit -m "feat: add findReportErrorCalls call-site parser"
```

---

### Task 4: `syncErrorReportingAuthUser`

**Files:**
- Create: `package/src/dynamic_pages_check/sync_error_reporting_auth_user.ts`
- Test: `package/src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts`

**Interfaces:**
- Consumes: `findPageFiles` from `./find_page_files.js`; `detectDynamicUsage`, `readExplicitDynamicValue` from `./detect_dynamic_usage.js` (Task 1); `collectReachableFiles` from `./collect_reachable_files.js` (Task 2); `findReportErrorCalls` from `./find_report_error_calls.js` (Task 3); `AliasConfig` from `./resolve_local_imports.js`; `DynamicPagesCheckMode` from `./check_dynamic_pages.js`.
- Produces:
  - `interface SyncErrorReportingAuthUserOptions { appDir: string; mode?: DynamicPagesCheckMode; target?: 'next' | 'vinext'; skip?: readonly string[]; aliases?: readonly AliasConfig[] }`
  - `interface SyncErrorReportingAuthUserReport { file: string; action: 'added-use-auth-user' | 'would-add-use-auth-user'; callCount: number }`
  - `interface SyncErrorReportingAuthUserIo { findPageFiles?: (appDir: string) => string[]; readFile?: (file: string) => string; writeFile?: (file: string, contents: string) => void; isFile?: (file: string) => boolean }`
  - `syncErrorReportingAuthUser(options: SyncErrorReportingAuthUserOptions, io?: SyncErrorReportingAuthUserIo): Promise<SyncErrorReportingAuthUserReport[]>`

- [ ] **Step 1: Write the failing tests**

Create `package/src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { syncErrorReportingAuthUser } from './sync_error_reporting_auth_user.js';

const APP_DIR = '/app';

function makeIo(sources: Record<string, string>) {
    const written: Record<string, string> = {};
    return {
        io: {
            findPageFiles: vi.fn(() => Object.keys(sources).filter((f) => f.includes('/app/'))),
            readFile: vi.fn((file: string) => {
                const source = sources[file];
                if (source === undefined) throw new Error(`no such file: ${file}`);
                return source;
            }),
            writeFile: vi.fn((file: string, contents: string) => {
                sources[file] = contents;
                written[file] = contents;
            }),
            isFile: vi.fn((file: string) => file in sources),
        },
        written,
    };
}

describe('syncErrorReportingAuthUser', () => {
    it('mode "off" scans nothing and returns an empty report', async () => {
        const { io } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'off' }, io);
        expect(reports).toEqual([]);
        expect(io.findPageFiles).not.toHaveBeenCalled();
    });

    it('adds useAuthUser: true to a reportError call reached only from a force-dynamic page', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('does NOT touch a reportError call reached from both a dynamic page and a static/unknown page', async () => {
        const { io, written } = makeIo({
            '/app/dynamic_page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function A() {}',
            '/app/static_page.tsx': 'export const dynamic = "force-static";\nimport "../repo";\nexport default function B() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('leaves a call with an already-explicit useAuthUser untouched', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X', useAuthUser: false });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('mode "report" reports would-add-use-auth-user and writes nothing', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'report' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'would-add-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('a page with no explicit export on target "next" is not-confirmed-dynamic even with a detected signal (Next decides, not this pass)', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'import { cookies } from "next/headers";\ncookies();\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', target: 'next' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('a page with no explicit export on target "vinext" with a detected signal counts as force-dynamic', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'import { cookies } from "next/headers";\ncookies();\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', target: 'vinext' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('counts multiple untouched calls in the same safely-reachable file', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': [
                `import { reportError } from "cloudflare-next-intl/errorHandling";`,
                `void reportError(cfg, { classOrMethodName: 'A' });`,
                `void reportError(cfg, { classOrMethodName: 'B' });`,
            ].join('\n'),
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 2 }]);
        expect(written['/repo.ts']).toMatch(/classOrMethodName: 'A'[\s\S]*useAuthUser: true,|useAuthUser: true,[\s\S]*classOrMethodName: 'A'/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts`
Expected: FAIL — module `./sync_error_reporting_auth_user.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `package/src/dynamic_pages_check/sync_error_reporting_auth_user.ts`:

```ts
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';
import { collectReachableFiles } from './collect_reachable_files.js';
import { findReportErrorCalls } from './find_report_error_calls.js';
import type { AliasConfig } from './resolve_local_imports.js';
import type { DynamicPagesCheckMode } from './check_dynamic_pages.js';

export interface SyncErrorReportingAuthUserOptions {
    appDir: string;
    mode?: DynamicPagesCheckMode;
    target?: 'next' | 'vinext';
    skip?: readonly string[];
    aliases?: readonly AliasConfig[];
}

export interface SyncErrorReportingAuthUserReport {
    file: string;
    action: 'added-use-auth-user' | 'would-add-use-auth-user';
    /** How many `reportError()` calls in this file were (or would be) touched. */
    callCount: number;
}

export interface SyncErrorReportingAuthUserIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
    isFile?: (file: string) => boolean;
}

function defaultIsFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function isConfirmedDynamic(source: string, reachableApis: readonly string[], target: 'next' | 'vinext'): boolean {
    const explicit = readExplicitDynamicValue(source);
    if (explicit !== null) return explicit === 'force-dynamic';
    if (target === 'vinext') return reachableApis.length > 0;
    // target 'next': no explicit export means Next's own inference decides — never confirmed dynamic here.
    return false;
}

/**
 * Whole-app companion pass to `checkDynamicPages`: finds every
 * `reportError(config, { ... })` call reachable from a page this package
 * already knows is `force-dynamic`, and — only when that call's file is
 * reachable from confirmed-dynamic pages ALONE, never from any page whose
 * status isn't confirmed dynamic — inserts `useAuthUser: true,` into its
 * params object. A call in a file shared with even one static/unknown-
 * status page is left untouched, since setting `useAuthUser` there would
 * make `resolveErrorReportingUser` call `getAuthUser()` (`cookies()`) on a
 * request this package can't prove is safe to make dynamic.
 *
 * Deliberately separate from `checkDynamicPages` itself (call both
 * directly, or use `checkDynamicPages`'s `syncErrorReportingAuthUser: true`
 * option to run this immediately after it) — this pass mutates arbitrary
 * call-site argument objects across your app, a materially bigger blast
 * radius than inserting one `export const dynamic` per page, so it stays
 * its own explicit opt-in.
 */
export async function syncErrorReportingAuthUser(
    options: SyncErrorReportingAuthUserOptions,
    io: SyncErrorReportingAuthUserIo = {},
): Promise<SyncErrorReportingAuthUserReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];
    const target = options.target ?? 'next';

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases: readonly AliasConfig[] = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];

    const dynamicReachable = new Set<string>();
    const notConfirmedReachable = new Set<string>();
    const fileSources = new Map<string, string>();

    for (const page of findPageFiles(options.appDir)) {
        if (skipSet.has(page)) continue;
        const source = readFile(page);
        const files = collectReachableFiles(page, source, aliases, { readFile, isFile });

        const apis = new Set<string>();
        for (const [file, fileSource] of files) {
            fileSources.set(file, fileSource);
            detectDynamicUsage(fileSource).detectedDynamicApis.forEach((api) => apis.add(api));
        }

        const bucket = isConfirmedDynamic(source, [...apis], target) ? dynamicReachable : notConfirmedReachable;
        for (const file of files.keys()) bucket.add(file);
    }

    const safeFiles = [...dynamicReachable].filter((file) => !notConfirmedReachable.has(file));

    const reports: SyncErrorReportingAuthUserReport[] = [];
    for (const file of safeFiles) {
        const source = fileSources.get(file)!;
        const calls = findReportErrorCalls(source).filter(
            (call) => call.insertPos !== null && !call.hasExplicitUseAuthUser,
        );
        if (calls.length === 0) continue;

        if (mode === 'fix') {
            let rewritten = source;
            // Insert back-to-front so earlier calls' insertPos offsets stay valid.
            for (const call of [...calls].sort((a, b) => b.insertPos! - a.insertPos!)) {
                rewritten = `${rewritten.slice(0, call.insertPos!)}useAuthUser: true, ${rewritten.slice(call.insertPos!)}`;
            }
            writeFile(file, rewritten);
            reports.push({ file, action: 'added-use-auth-user', callCount: calls.length });
        } else {
            reports.push({ file, action: 'would-add-use-auth-user', callCount: calls.length });
        }
    }

    return reports;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/sync_error_reporting_auth_user.ts package/src/dynamic_pages_check/sync_error_reporting_auth_user.test.ts
git commit -m "feat: add syncErrorReportingAuthUser whole-app pass"
```

---

### Task 5: Wire into `checkDynamicPages`

**Files:**
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.ts`
- Test: `package/src/dynamic_pages_check/check_dynamic_pages.test.ts`

**Interfaces:**
- Consumes: `syncErrorReportingAuthUser`, `SyncErrorReportingAuthUserReport` from `./sync_error_reporting_auth_user.js` (Task 4).
- Produces: `CheckDynamicPagesOptions` gains `syncErrorReportingAuthUser?: boolean` (default `false`). `checkDynamicPages`'s return type becomes `Promise<(CheckDynamicPagesReport | SyncErrorReportingAuthUserReport)[]>` — when the option is left off (the default), no `SyncErrorReportingAuthUserReport` ever appears at runtime; existing callers that only match on the original `CheckDynamicPagesReport['action']` values are unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `package/src/dynamic_pages_check/check_dynamic_pages.test.ts`, inside the existing `describe('checkDynamicPages', ...)` block:

```ts
    it('syncErrorReportingAuthUser defaults to false: leaves an eligible reportError call untouched', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/page.tsx') return 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}';
            if (file === '/repo.ts') return `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`;
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) => file === '/app/page.tsx' || file === '/repo.ts');

        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'already-declared' }]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('syncErrorReportingAuthUser: true appends its own reports and rewrites the eligible call', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/page.tsx') return 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}';
            if (file === '/repo.ts') return `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`;
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) => file === '/app/page.tsx' || file === '/repo.ts');

        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', syncErrorReportingAuthUser: true }, io);

        expect(reports).toEqual([
            { file: '/app/page.tsx', action: 'already-declared' },
            { file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 },
        ]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: FAIL — `syncErrorReportingAuthUser` option doesn't exist on `checkDynamicPages` yet, second test's extra report entry is missing.

- [ ] **Step 3: Wire it in**

In `package/src/dynamic_pages_check/check_dynamic_pages.ts`, add the import:

```ts
import { syncErrorReportingAuthUser, type SyncErrorReportingAuthUserReport } from './sync_error_reporting_auth_user.js';
```

Add the option to `CheckDynamicPagesOptions` (after `aliases`):

```ts
    /**
     * Defaults to `false`. When enabled, runs `syncErrorReportingAuthUser`
     * immediately after the main per-page scan, using this same
     * `appDir`/`mode`/`target`/`skip`/`aliases` — see that function's docs
     * for what it does and why it's opt-in. Its reports are appended to
     * this call's returned array.
     */
    syncErrorReportingAuthUser?: boolean;
```

Change the function's return type and append the sync pass's reports right before the final `return reports;`:

```ts
export async function checkDynamicPages(
    options: CheckDynamicPagesOptions,
    io: CheckDynamicPagesIo = {},
): Promise<(CheckDynamicPagesReport | SyncErrorReportingAuthUserReport)[]> {
```

```ts
    if (options.syncErrorReportingAuthUser === true) {
        const syncReports = await syncErrorReportingAuthUser(
            { appDir: options.appDir, mode: options.mode, target: options.target, skip: options.skip, aliases: options.aliases },
            { findPageFiles, readFile, writeFile, isFile },
        );
        reports.push(...syncReports);
    }
    return reports;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: PASS — including every pre-existing test (they never set `syncErrorReportingAuthUser`, so it stays off and their assertions on `reports` are unaffected).

- [ ] **Step 5: Run the full dynamic_pages_check suite with coverage**

Run: `cd package && npx vitest run src/dynamic_pages_check --coverage`
Expected: PASS, 100% stmts/branch/funcs/lines on every file touched this plan (this repo's CI enforces a 100% coverage gate per-file — see `docs/superpowers/plans/2026-09-01-transitive-dynamic-detection.md`'s Task 4-era CI failure for what an uncovered branch/line looks like there). If any line/branch is short, add a targeted test the same way that plan did (e.g. an explicit `io.isFile` omission case for `defaultIsFile`, a real-fs case, a cap-triggering case) before moving on — do not proceed to Task 6 with coverage below 100% on a touched file.

- [ ] **Step 6: Commit**

```bash
git add package/src/dynamic_pages_check/check_dynamic_pages.ts package/src/dynamic_pages_check/check_dynamic_pages.test.ts
git commit -m "feat: wire syncErrorReportingAuthUser into checkDynamicPages"
```

---

### Task 6: Vite plugin passthrough

**Files:**
- Modify: `package/src/vite/auto_dynamic_pages_plugin.ts`
- Test: `package/src/vite/auto_dynamic_pages_plugin.test.ts`

**Interfaces:**
- Consumes: `checkDynamicPages`'s `syncErrorReportingAuthUser` option (Task 5).
- Produces: `AutoDynamicPagesPluginOptions` gains `syncErrorReportingAuthUser?: boolean` (default `false`), passed straight through to the `checkDynamicPages` call inside `configResolved`.

- [ ] **Step 1: Write the failing test**

Add to `package/src/vite/auto_dynamic_pages_plugin.test.ts`, inside the existing `describe("autoDynamicPagesPlugin", ...)` block:

```ts
    it("passes syncErrorReportingAuthUser through to checkDynamicPages, defaulting to false", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const checkDynamicPagesModule = await import("../dynamic_pages_check/index.js");
        const spy = vi.spyOn(checkDynamicPagesModule, "checkDynamicPages");

        const plugin = autoDynamicPagesPlugin({ syncErrorReportingAuthUser: true });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR });

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ syncErrorReportingAuthUser: true }),
        );
        spy.mockRestore();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/vite/auto_dynamic_pages_plugin.test.ts`
Expected: FAIL — `checkDynamicPages` is called without `syncErrorReportingAuthUser`.

- [ ] **Step 3: Add the passthrough**

In `package/src/vite/auto_dynamic_pages_plugin.ts`, add the option to `AutoDynamicPagesPluginOptions` (after `target`):

```ts
    /**
     * Defaults to `false`. Passed straight through to `checkDynamicPages`'s
     * `syncErrorReportingAuthUser` option — see its docs. Opt-in separately
     * from this plugin's own default-on `autoDynamicPages` behavior, since
     * it mutates `reportError()` call-site arguments across your app, not
     * just one `export const dynamic` per page.
     */
    syncErrorReportingAuthUser?: boolean;
```

And add the field to the `checkDynamicPages` call inside `configResolved`:

```ts
                await checkDynamicPages({
                    appDir,
                    mode: options.mode ?? "fix",
                    target: options.target ?? "vinext",
                    syncErrorReportingAuthUser: options.syncErrorReportingAuthUser ?? false,
                });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/vite/auto_dynamic_pages_plugin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/vite/auto_dynamic_pages_plugin.ts package/src/vite/auto_dynamic_pages_plugin.test.ts
git commit -m "feat: pass syncErrorReportingAuthUser through the Vite plugin"
```

---

### Task 7: Docs, changelog, version bump

**Files:**
- Modify: `package/README.md`
- Modify: `package/CHANGELOG.md`
- Modify: `package/package.json`

**Interfaces:**
- Consumes: nothing new — this task only documents Tasks 1-6's finished, tested behavior.

- [ ] **Step 1: Bump the version**

In `package/package.json`, change:

```json
  "version": "0.9.15",
```

to:

```json
  "version": "0.9.16",
```

(Confirm `0.9.15` is still current at execution time — check `grep -n '"version"' package/package.json` first; if a later release has already landed, bump from whatever's actually there instead.)

- [ ] **Step 2: Add the CHANGELOG entry**

In `package/CHANGELOG.md`, add above the current top entry:

```markdown
## [0.9.16] - 2026-09-01

### Added

- **`syncErrorReportingAuthUser`** (`cloudflare-next-intl/checkDynamicPages`,
  also as `checkDynamicPages`'s and the `autoDynamicPages` Vite plugin's new
  `syncErrorReportingAuthUser` option, default `false`): a whole-app
  companion pass that auto-inserts `useAuthUser: true` into `reportError()`
  call sites reached *only* from pages already confirmed `force-dynamic` —
  so those reports get the signed-in user attached without a hand-written
  `useAuthUser: true` per call site. A call reachable from even one
  static/unknown-status page is left untouched (default `false` stays in
  effect there), so this can never make a static page dynamic on its own.
```

- [ ] **Step 3: Document it in the README**

In `package/README.md`, extend the `resolveErrorReportingUser` bullet added in 0.9.15 (find it via `grep -n resolveErrorReportingUser README.md`) with a short paragraph directly after its existing code example:

```markdown
  A specific call site rarely needs to set `useAuthUser: true` by hand: `syncErrorReportingAuthUser` (`cloudflare-next-intl/checkDynamicPages`, also `checkDynamicPages`'s and the Vite plugin's `syncErrorReportingAuthUser` option, default `false`) does it for you — it finds every `reportError()` call reached *only* from pages already confirmed `force-dynamic` and inserts `useAuthUser: true` there automatically, leaving alone any call reachable from even one static/unknown-status page. Opt in explicitly (it mutates call-site arguments across your app, a bigger change than the top-of-file `export const dynamic` insertion `checkDynamicPages` does by default):

  ```ts
  await checkDynamicPages({ appDir, mode: "fix", syncErrorReportingAuthUser: true });
  ```
```

- [ ] **Step 4: Rebuild**

Run: `cd package && npm run build`
Expected: builds cleanly, `dist/package.json` rewritten.

- [ ] **Step 5: Full suite + typecheck one more time**

Run: `cd package && npx tsc --noEmit && npx vitest run --coverage`
Expected: no TypeScript errors; full suite passes; no coverage `ERROR:` lines for any file this plan touched or created.

- [ ] **Step 6: Commit**

```bash
git add package/package.json package/CHANGELOG.md package/README.md
git commit -m "docs: document syncErrorReportingAuthUser, bump to 0.9.16"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1-3 build the primitives (explicit-value reader, extracted reachable-files walk, call-site parser). Task 4 is the actual feature (whole-app pass with the "only exclusively-dynamic-reachable files get rewritten" safety rule the user asked for). Task 5-6 wire it into the two existing entry points (`checkDynamicPages`, the Vite plugin) as an explicit opt-in, matching the project's existing conservative-by-default posture. Task 7 documents and versions it, mirroring how the two prior features (transitive tracing in 0.9.14, `resolveErrorReportingUser` in 0.9.15) were shipped.
- **Placeholder scan:** every step has runnable code, exact test bodies, and exact run commands; no "add appropriate handling"-style steps.
- **Type consistency:** `AliasConfig` (from `resolve_local_imports.ts`), `CollectReachableFilesIo`/`MAX_FILES_VISITED` (Task 2), `ReportErrorCall` (Task 3), and `DynamicPagesCheckMode` (existing, from `check_dynamic_pages.ts`) are each defined once and only ever imported elsewhere — never redefined with a different shape. `TraceDynamicUsageIo` becomes a type alias of `CollectReachableFilesIo` rather than a duplicate structural type. `SyncErrorReportingAuthUserReport`'s `action` values (`'added-use-auth-user'` / `'would-add-use-auth-user'`) match exactly between Task 4's implementation, Task 4's tests, and Task 5's integration test.
- **Regression safety:** Task 2's refactor is explicitly checked against the *unmodified* `trace_dynamic_usage.test.ts` before any new code depends on `collectReachableFiles` — if that step's run fails, the plan calls out fixing it before proceeding, rather than silently editing the pre-existing test to match new (wrong) behavior.
