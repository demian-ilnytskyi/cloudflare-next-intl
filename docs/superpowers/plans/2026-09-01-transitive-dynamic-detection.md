# Transitive Dynamic-API Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `checkDynamicPages` so it no longer auto-inserts `force-static` on pages whose auth/dynamic-API usage lives in an imported local file instead of the page file itself, and un-break the one production page (CRV's `audit/[propertyId]/page.tsx`) it already mis-tagged.

**Architecture:** `detectDynamicUsage` only regex-scans the single file it's given. CRV's `audit/[propertyId]/page.tsx` calls no dynamic API itself — its per-user data comes from `AuditContent` (a separate file), which calls repository functions that call `getAuthUser()` (from `cloudflare-next-intl`), which internally calls Next's `cookies()`. Because `checkDynamicPages` runs with `target: 'vinext'` (the vite plugin's default) and the page text shows zero signal, it inserted `force-static` — the one case where "no signal detected" writes a value instead of leaving Next's/vinext's own default alone. Fix: (1) recognize `getAuthUser()`/`useAuthUser()` calls as a dynamic signal directly, since they wrap `cookies()`; (2) also recognize `withUserDb(` (from `cloudflare-next-intl/db`) as a dynamic signal directly — it runs a per-signed-in-user, RLS-scoped DB query and resolves the uid via `getAuthUser()`/cookies internally (`db/context.ts`'s `resolveUserId`) whenever no explicit `uid` is passed, a text-invisible dependency the same way `getAuthUser()` itself was; (3) follow the page's local (relative/`@/`-alias) imports transitively and union the dynamic-API signals found across that whole reachable file set, so a signal in an imported file — the repository that calls `getAuthUser()`/`withUserDb()` — counts too, not just the page file's own text.

**Tech Stack:** TypeScript, Vitest, Node `fs`/`path`.

**Spec:** No separate spec doc — this plan is driven directly from the investigated bug (see Architecture above) in `package/src/dynamic_pages_check/` and `package/src/vite/auto_dynamic_pages_plugin.ts`.

## Global Constraints

- Text-based heuristics only — no TypeScript compiler API dependency (existing project constraint, stated in `detect_dynamic_usage.ts`).
- Stay conservative on `target: 'next'`: a missed signal there just means Next's own inference decides, same as today — do not change that branch's behavior.
- Traversal must be bounded (cycle-safe, cap on visited files) — never turn a single page's check into an unbounded project-wide scan.
- Only follow same-project imports (relative `./`/`../` or the configured alias prefix, e.g. `@/`) — bare package specifiers (`node_modules`) are not opened.
- Keep the `CheckDynamicPagesIo`-style dependency injection pattern already used in this module (`readFile`/`writeFile`/`findPageFiles`) so tests stay fs-free.

---

## File Structure

- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.ts` — add `getAuthUser()`/`useAuthUser()` signal patterns.
- Create: `package/src/dynamic_pages_check/resolve_local_imports.ts` — extract import specifiers from source text; resolve a relative/alias specifier to an existing local file path.
- Create: `package/src/dynamic_pages_check/resolve_local_imports.test.ts`
- Create: `package/src/dynamic_pages_check/trace_dynamic_usage.ts` — BFS over a page file's local import graph, unioning `detectDynamicUsage` results.
- Create: `package/src/dynamic_pages_check/trace_dynamic_usage.test.ts`
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.ts` — use `traceDynamicUsage` instead of a single-file `detectDynamicUsage` call; add `aliases`/`resolveImports`/`isFile` options.
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.test.ts` — add the regression case (page imports a file that calls `getAuthUser()`).
- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts` — add cases for the new patterns.
- Modify (external repo): `/Volumes/External/clarivant/CRV/src/app/[locale]/audit/[propertyId]/page.tsx` — remove the wrongly auto-inserted `force-static` export.

---

### Task 1: Recognize `getAuthUser()`/`useAuthUser()`/`withUserDb()` as a dynamic signal

**Files:**
- Modify: `package/src/dynamic_pages_check/detect_dynamic_usage.ts`
- Test: `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts`

**Interfaces:**
- Produces: no signature change — `DYNAMIC_API_CHECKS` gains three entries, so `detectDynamicUsage(sourceText).detectedDynamicApis` can now include `'getAuthUser()'` / `'useAuthUser()'` / `'withUserDb()'`.

- [ ] **Step 1: Write the failing tests**

Add to `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts`, inside the existing `describe('detectDynamicUsage', ...)` block:

```ts
    it('detects getAuthUser() as a dynamic signal (it wraps cookies())', () => {
        const result = detectDynamicUsage(
            `import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { const { user } = await getAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('detects useAuthUser() as a dynamic signal', () => {
        const result = detectDynamicUsage(
            `import useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";\nasync function f() { await useAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('useAuthUser()');
    });

    it('detects withUserDb() as a dynamic signal (it resolves uid via getAuthUser()/cookies internally)', () => {
        const result = detectDynamicUsage(
            `import { withUserDb } from "cloudflare-next-intl/db";\nasync function f() { return withUserDb((db) => db.select().from(table)); }`
        );
        expect(result.detectedDynamicApis).toContain('withUserDb()');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: FAIL — `detectedDynamicApis` does not contain `'getAuthUser()'`/`'useAuthUser()'`.

- [ ] **Step 3: Add the patterns**

In `package/src/dynamic_pages_check/detect_dynamic_usage.ts`, add three entries to `DYNAMIC_API_CHECKS` (after the `'next: { revalidate: 0 }'` entry):

```ts
    { name: 'getAuthUser()', pattern: /\bgetAuthUser\s*\(/ },
    { name: 'useAuthUser()', pattern: /\buseAuthUser\s*\(/ },
    { name: 'withUserDb()', pattern: /\bwithUserDb\s*\(/ },
```

Also update the block comment above `DYNAMIC_API_CHECKS` to note the new signals are calls to this package's own auth/db helpers, which wrap `cookies()` (directly, or via a signed-in-user id lookup) internally — add this line right before the `const DYNAMIC_API_CHECKS` declaration:

```ts
// `getAuthUser()`/`useAuthUser()` are this package's own server-side auth
// helpers (`cloudflare-next-intl/getFirebaseAuthUser`,
// `.../useFirebaseAuthUser`) — both call Next's `cookies()` internally, so a
// call to either is itself a dynamic signal even though the literal text
// `cookies(` never appears at the call site. `withUserDb()`
// (`cloudflare-next-intl/db`) runs a per-signed-in-user, RLS-scoped query —
// when its caller passes no explicit `uid`, it resolves one via
// `getAuthUser()` internally (`db/context.ts`'s `resolveUserId`), the same
// text-invisible dependency, so it's flagged unconditionally rather than
// trying to detect whether a given call site happens to pass `uid` itself.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/detect_dynamic_usage.ts package/src/dynamic_pages_check/detect_dynamic_usage.test.ts
git commit -m "fix: recognize getAuthUser()/useAuthUser()/withUserDb() as dynamic-API signals"
```

---

### Task 2: Resolve local import specifiers to files

**Files:**
- Create: `package/src/dynamic_pages_check/resolve_local_imports.ts`
- Test: `package/src/dynamic_pages_check/resolve_local_imports.test.ts`

**Interfaces:**
- Produces:
  - `interface AliasConfig { prefix: string; replacement: string }`
  - `extractImportSpecifiers(sourceText: string): string[]`
  - `resolveLocalImport(specifier: string, fromFile: string, aliases: readonly AliasConfig[], isFile?: (file: string) => boolean): string | null`

- [ ] **Step 1: Write the failing tests**

Create `package/src/dynamic_pages_check/resolve_local_imports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractImportSpecifiers, resolveLocalImport } from './resolve_local_imports.js';

describe('extractImportSpecifiers', () => {
    it('extracts named, default, and namespace import specifiers', () => {
        const source = `
import { cookies } from "next/headers";
import Foo from "./foo";
import * as Bar from "../bar";
import "./side_effect_only";
`;
        expect(extractImportSpecifiers(source)).toEqual([
            'next/headers',
            './foo',
            '../bar',
            './side_effect_only',
        ]);
    });

    it('extracts re-export specifiers', () => {
        const source = `export { fetchAuditDraft } from "./audit_draft_repository";`;
        expect(extractImportSpecifiers(source)).toEqual(['./audit_draft_repository']);
    });

    it('returns an empty array when there are no imports', () => {
        expect(extractImportSpecifiers('export default function Page() {}')).toEqual([]);
    });
});

describe('resolveLocalImport', () => {
    const isFile = (file: string) => new Set([
        '/repo/src/app/audit/audit_content.tsx',
        '/repo/src/app/audit/accessible_property_repository.ts',
        '/repo/src/shared/utils/require_flavour.ts',
    ]).has(file);

    it('resolves a relative specifier with an implicit extension', () => {
        const resolved = resolveLocalImport(
            './audit_content',
            '/repo/src/app/audit/page.tsx',
            [],
            isFile,
        );
        expect(resolved).toBe('/repo/src/app/audit/audit_content.tsx');
    });

    it('resolves an alias-prefixed specifier', () => {
        const resolved = resolveLocalImport(
            '@/shared/utils/require_flavour',
            '/repo/src/app/audit/page.tsx',
            [{ prefix: '@/', replacement: '/repo/src/' }],
            isFile,
        );
        expect(resolved).toBe('/repo/src/shared/utils/require_flavour.ts');
    });

    it('returns null for a bare package specifier with no matching alias', () => {
        const resolved = resolveLocalImport('next/headers', '/repo/src/app/audit/page.tsx', [], isFile);
        expect(resolved).toBeNull();
    });

    it('returns null when no candidate extension resolves to a real file', () => {
        const resolved = resolveLocalImport('./does_not_exist', '/repo/src/app/audit/page.tsx', [], isFile);
        expect(resolved).toBeNull();
    });

    it('falls back to an index file when the specifier resolves to a directory', () => {
        const isFileWithIndex = (file: string) => file === '/repo/src/app/audit/index.ts';
        const resolved = resolveLocalImport('./audit', '/repo/src/app/page.tsx', [], isFileWithIndex);
        expect(resolved).toBe('/repo/src/app/audit/index.ts');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/resolve_local_imports.test.ts`
Expected: FAIL — module `./resolve_local_imports.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `package/src/dynamic_pages_check/resolve_local_imports.ts`:

```ts
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface AliasConfig {
    /** e.g. `'@/'` */
    prefix: string;
    /** Absolute directory the prefix resolves to. */
    replacement: string;
}

// Matches `from '...'` (covers `import ... from`, `import type ... from`,
// and `export ... from`) and bare `import '...'` side-effect imports.
// Text-based, same class of heuristic as detectDynamicUsage — good enough
// for this project's own import styles, not a full ES-module parser.
const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT_SPECIFIER = /(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g;

/** Extracts every `from '...'` and bare `import '...'` specifier from a file's source text, in the order they appear. */
export function extractImportSpecifiers(sourceText: string): string[] {
    const specifiers: string[] = [];

    FROM_SPECIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FROM_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }

    BARE_IMPORT_SPECIFIER.lastIndex = 0;
    while ((match = BARE_IMPORT_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }

    return specifiers;
}

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function defaultIsFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

/**
 * Resolves a relative (`./`, `../`) or alias-prefixed import specifier to an
 * existing local file, trying the specifier as given, each of
 * `FILE_EXTENSIONS` appended, then each extension under an `index` file
 * (for a specifier that names a directory). Returns `null` for a bare
 * package specifier that matches no configured alias, or one that doesn't
 * resolve to a real file under any of those candidates.
 */
export function resolveLocalImport(
    specifier: string,
    fromFile: string,
    aliases: readonly AliasConfig[],
    isFile: (file: string) => boolean = defaultIsFile,
): string | null {
    let base: string | null = null;

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        base = resolve(dirname(fromFile), specifier);
    } else {
        for (const alias of aliases) {
            if (specifier.startsWith(alias.prefix)) {
                base = join(alias.replacement, specifier.slice(alias.prefix.length));
                break;
            }
        }
    }

    if (base === null) return null;
    if (isFile(base)) return base;

    for (const ext of FILE_EXTENSIONS) {
        const candidate = `${base}${ext}`;
        if (isFile(candidate)) return candidate;
    }
    for (const ext of FILE_EXTENSIONS) {
        const candidate = join(base, `index${ext}`);
        if (isFile(candidate)) return candidate;
    }
    return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/resolve_local_imports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/resolve_local_imports.ts package/src/dynamic_pages_check/resolve_local_imports.test.ts
git commit -m "feat: resolve relative/alias import specifiers to local files"
```

---

### Task 3: Trace dynamic-API usage through a page's local import graph

**Files:**
- Create: `package/src/dynamic_pages_check/trace_dynamic_usage.ts`
- Test: `package/src/dynamic_pages_check/trace_dynamic_usage.test.ts`

**Interfaces:**
- Consumes: `detectDynamicUsage` from `./detect_dynamic_usage.js` (Task 1's updated version); `extractImportSpecifiers`, `resolveLocalImport`, `AliasConfig` from `./resolve_local_imports.js` (Task 2).
- Produces: `traceDynamicUsage(entryFile: string, entrySource: string, aliases: readonly AliasConfig[], io: { readFile: (file: string) => string; isFile?: (file: string) => boolean }): DynamicDetectionResult` (same `DynamicDetectionResult` shape Task 1 already exports from `detect_dynamic_usage.ts`).

- [ ] **Step 1: Write the failing tests**

Create `package/src/dynamic_pages_check/trace_dynamic_usage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { traceDynamicUsage } from './trace_dynamic_usage.js';

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

describe('traceDynamicUsage', () => {
    it('finds a signal in the entry file itself, same as detectDynamicUsage', () => {
        const source = 'import { cookies } from "next/headers";\ncookies();';
        const result = traceDynamicUsage('/repo/src/app/page.tsx', source, [], makeIo({}));
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('finds a signal in a file reached through a relative import', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'export { default } from "./audit_content";',
            '/repo/src/app/audit/audit_content.tsx':
                'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('follows two hops: page -> content -> repository -> getAuthUser()', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'import AuditContent from "./audit_content";',
            '/repo/src/app/audit/audit_content.tsx': 'import { fetchDraft } from "./audit_draft_repository";',
            '/repo/src/app/audit/audit_draft_repository.ts':
                'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function fetchDraft() { await getAuthUser(); }',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('follows an alias-prefixed import', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'import requireFlavour from "@/shared/utils/require_flavour";',
            '/repo/src/shared/utils/require_flavour.ts':
                'import { headers } from "next/headers";\nheaders();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            ALIASES,
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('headers()');
    });

    it('does not open a bare package specifier', () => {
        const readFile = (file: string) => {
            throw new Error(`should not read: ${file}`);
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            'import { z } from "zod";',
            [],
            { readFile, isFile: () => false },
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('is cycle-safe (a imports b, b imports a)', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'import "./page";\nimport { cookies } from "next/headers";\ncookies();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('reports hasExplicitDynamicExport from the entry file only, not an imported file', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import "./other";',
            '/repo/src/app/other.ts': 'export const dynamic = "force-dynamic";',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.hasExplicitDynamicExport).toBe(false);
    });

    it('deduplicates a signal found in multiple files', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import { cookies } from "next/headers";\nimport "./b";\ncookies();',
            '/repo/src/app/b.ts': 'import { cookies } from "next/headers";\ncookies();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/trace_dynamic_usage.test.ts`
Expected: FAIL — module `./trace_dynamic_usage.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `package/src/dynamic_pages_check/trace_dynamic_usage.ts`:

```ts
import { detectDynamicUsage, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { extractImportSpecifiers, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';

export interface TraceDynamicUsageIo {
    readFile: (file: string) => string;
    isFile?: (file: string) => boolean;
}

/**
 * Safety cap on how many local files one page's import graph can pull in
 * before traversal stops. A runaway or accidentally-cyclic graph should
 * degrade to "some signals possibly missed", never to a full-project scan.
 */
const MAX_FILES_VISITED = 300;

/**
 * Same signal `detectDynamicUsage` finds in one file, but unioned across
 * that file's local (relative/alias) import graph: a page whose own text
 * looks static can still depend — through an imported component or
 * repository, several hops away — on a call that reaches `cookies()` or a
 * dynamic-wrapping helper, invisible to a single-file scan. Only
 * same-project files are opened; a specifier that resolves to neither a
 * relative path nor a configured alias (an npm package) is left as opaque
 * text, matching `detectDynamicUsage`'s own text-only, no-compiler-API
 * design.
 */
export function traceDynamicUsage(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: TraceDynamicUsageIo,
): DynamicDetectionResult {
    const isFile = io.isFile ?? (() => false);

    const visited = new Set<string>([entryFile]);
    const queue: { file: string; source: string }[] = [{ file: entryFile, source: entrySource }];

    let hasExplicitDynamicExport = false;
    const detectedApis = new Set<string>();
    let first = true;

    while (queue.length > 0) {
        const current = queue.shift()!;
        const detection = detectDynamicUsage(current.source);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.detectedDynamicApis.forEach((api) => detectedApis.add(api));

        if (visited.size >= MAX_FILES_VISITED) continue;

        for (const specifier of extractImportSpecifiers(current.source)) {
            if (visited.size >= MAX_FILES_VISITED) break;
            const resolved = resolveLocalImport(specifier, current.file, aliases, isFile);
            if (resolved === null || visited.has(resolved)) continue;
            visited.add(resolved);

            let importedSource: string;
            try {
                importedSource = io.readFile(resolved);
            } catch {
                continue;
            }
            queue.push({ file: resolved, source: importedSource });
        }
    }

    return { hasExplicitDynamicExport, detectedDynamicApis: [...detectedApis] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/trace_dynamic_usage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/trace_dynamic_usage.ts package/src/dynamic_pages_check/trace_dynamic_usage.test.ts
git commit -m "feat: trace dynamic-API usage through a page's local import graph"
```

---

### Task 4: Wire transitive tracing into `checkDynamicPages`

**Files:**
- Modify: `package/src/dynamic_pages_check/check_dynamic_pages.ts`
- Test: `package/src/dynamic_pages_check/check_dynamic_pages.test.ts`

**Interfaces:**
- Consumes: `traceDynamicUsage`, `TraceDynamicUsageIo` from `./trace_dynamic_usage.js` (Task 3); `AliasConfig` from `./resolve_local_imports.js` (Task 2).
- Produces: `CheckDynamicPagesOptions` gains `aliases?: readonly AliasConfig[]` and `resolveImports?: boolean` (default `true`); `CheckDynamicPagesIo` gains `isFile?: (file: string) => boolean`. Default `aliases` is `[{ prefix: '@/', replacement: resolve(appDir, '..') }]` when `options.aliases` is not given.

- [ ] **Step 1: Write the failing test**

Add to `package/src/dynamic_pages_check/check_dynamic_pages.test.ts`, inside the existing `describe('checkDynamicPages', ...)` block:

```ts
    it('follows a local import to catch getAuthUser() usage the page file itself never mentions (regression: CRV audit page)', async () => {
        const { io, written } = makeIo({
            '/app/audit/[propertyId]/page.tsx': 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/audit/[propertyId]/page.tsx') {
                return '/app/audit/[propertyId]/page.tsx';
            }
            if (file === '/app/audit/audit_content.tsx') {
                return 'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }';
            }
            throw new Error(`unexpected read: ${file}`);
        });
        // makeIo's readFile above is a placeholder shape; give it the real
        // source directly so the page-file branch matches the fixture text.
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/audit/[propertyId]/page.tsx') {
                return 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }';
            }
            if (file === '/app/audit/audit_content.tsx') {
                return 'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }';
            }
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) =>
            file === '/app/audit/audit_content.tsx' || file === '/app/audit/[propertyId]/page.tsx'
        );

        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'fix', target: 'vinext' },
            io,
        );

        expect(reports).toEqual([{ file: '/app/audit/[propertyId]/page.tsx', action: 'added-force-dynamic' }]);
        expect(written['/app/audit/[propertyId]/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('resolveImports: false disables local-import tracing (single-file behavior)', async () => {
        const { io, written } = makeIo({
            '/app/audit/[propertyId]/page.tsx': 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }',
        });
        io.isFile = vi.fn(() => true);

        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'fix', target: 'vinext', resolveImports: false },
            io,
        );

        expect(reports).toEqual([{ file: '/app/audit/[propertyId]/page.tsx', action: 'added-force-static' }]);
        expect(written['/app/audit/[propertyId]/page.tsx']).toContain('export const dynamic = "force-static";');
    });
```

`makeIo`'s `readFile` mock (`vi.fn((file: string) => sources[file])`) already throws `undefined`-returning behavior for unmapped files rather than throwing — since `sources[file]` is `undefined` for `/app/audit/audit_content.tsx`, calling `detectDynamicUsage(undefined)` would break the test in a confusing way, so this test overrides `io.readFile`/`io.isFile` directly. Also add `vi` is already imported in this file's header — no import change needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: FAIL — first new test currently reports `action: 'added-force-static'` (today's bug, reproduced under test); second test doesn't fail today since there's no tracing yet, but add it anyway so it locks in the escape hatch once tracing exists — expected to already pass, which step 4 confirms.

- [ ] **Step 3: Wire tracing into `checkDynamicPages`**

Rewrite `package/src/dynamic_pages_check/check_dynamic_pages.ts`:

```ts
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage } from './detect_dynamic_usage.js';
import { traceDynamicUsage } from './trace_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';
import type { AliasConfig } from './resolve_local_imports.js';

/** `'off'` — don't scan at all (the global disable switch). `'report'` — scan and say what would change, write nothing. `'fix'` — scan and write the missing `export const dynamic` into each qualifying file. */
export type DynamicPagesCheckMode = 'off' | 'report' | 'fix';

export interface CheckDynamicPagesOptions {
    /** Root directory to scan recursively for `page.*`/`route.*` files — typically your Next.js `app/` directory. */
    appDir: string;
    /**
     * Defaults to `'report'`. The codemod's import-boundary detection is a
     * text heuristic, not a real parser, so `'fix'` can misplace the
     * inserted export on an unusual file; opt in explicitly once you've
     * reviewed a `'report'` run's output.
     */
    mode?: DynamicPagesCheckMode;
    /**
     * Defaults to `'next'`. On real Next.js, a page with no detected
     * dynamic-API usage is left untouched — Next infers static/dynamic on
     * its own, so inserting `force-static` there would be an unsafe
     * default (a page can be dynamic through means this text-based scan
     * doesn't see). **vinext doesn't do that inference**: a page with no
     * explicit `dynamic` export is never prerendered, regardless of
     * whether it actually uses any dynamic API. Pass `'vinext'` to restore
     * `force-static` insertion on "no signal detected" for that runtime.
     */
    target?: 'next' | 'vinext';
    /** File paths (as returned by `findPageFiles` — i.e. joined with `appDir`) to leave completely alone: not read, not written, not reported as anything but `'skipped'`. */
    skip?: readonly string[];
    /**
     * Defaults to `true`. When enabled, a page's dynamic-API signal search
     * also follows its local (relative/`aliases`-prefixed) imports —
     * transitively, cycle-safe, capped — so a signal in an imported
     * component or repository counts too, not just the page file's own
     * text. Set `false` to restore the original single-file-only scan.
     */
    resolveImports?: boolean;
    /**
     * Alias prefixes to resolve during import tracing (ignored when
     * `resolveImports` is `false`). Defaults to a single `'@/'` entry
     * resolving to `appDir`'s parent directory (the common `src/app` +
     * `@/*` -> `./src/*` tsconfig convention) — pass your own to override.
     */
    aliases?: readonly AliasConfig[];
}

export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-dynamic' | 'would-add-force-dynamic' | 'added-force-static' | 'would-add-force-static' | 'already-declared' | 'no-dynamic-usage-detected' | 'skipped';
}

export interface CheckDynamicPagesIo {
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

export async function checkDynamicPages(
    options: CheckDynamicPagesOptions,
    io: CheckDynamicPagesIo = {},
): Promise<CheckDynamicPagesReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];
    const target = options.target ?? 'next';
    const resolveImports = options.resolveImports ?? true;

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases: readonly AliasConfig[] = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];

    const reports: CheckDynamicPagesReport[] = [];
    for (const file of findPageFiles(options.appDir)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }

        const source = readFile(file);
        const detection = resolveImports
            ? traceDynamicUsage(file, source, aliases, { readFile, isFile })
            : detectDynamicUsage(source);
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared' });
            continue;
        }
        if (detection.detectedDynamicApis.length === 0) {
            // On real Next.js, leave it to Next's own static/dynamic
            // inference — a false negative here just means Next decides
            // instead of us. On vinext, no explicit export means "never
            // prerendered" regardless of usage, so `force-static` is the
            // correct default there, not an unsafe one.
            if (target !== 'vinext') {
                reports.push({ file, action: 'no-dynamic-usage-detected' });
                continue;
            }
            if (mode === 'fix') {
                writeFile(file, insertDynamicExport(source, 'force-static'));
                reports.push({ file, action: 'added-force-static' });
            } else {
                reports.push({ file, action: 'would-add-force-static' });
            }
            continue;
        }

        if (mode === 'fix') {
            writeFile(file, insertDynamicExport(source, 'force-dynamic'));
            reports.push({ file, action: 'added-force-dynamic' });
        } else {
            reports.push({ file, action: 'would-add-force-dynamic' });
        }
    }
    return reports;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: PASS — including the two new tests and every pre-existing test (pre-existing tests never set `io.isFile`, so `resolveImports` tracing finds no resolvable local imports there and behaves exactly as before).

- [ ] **Step 5: Run the full dynamic_pages_check + vite suites**

Run: `cd package && npx vitest run src/dynamic_pages_check src/vite/auto_dynamic_pages_plugin.test.ts`
Expected: PASS. (`auto_dynamic_pages_plugin.test.ts` exercises real fs with plain single-file pages that have no local imports to follow, so its assertions are unaffected by tracing being on by default.)

- [ ] **Step 6: Commit**

```bash
git add package/src/dynamic_pages_check/check_dynamic_pages.ts package/src/dynamic_pages_check/check_dynamic_pages.test.ts
git commit -m "fix: follow local imports when checking a page for dynamic-API usage"
```

---

### Task 5: Un-break CRV's audit page

**Files:**
- Modify: `/Volumes/External/clarivant/CRV/src/app/[locale]/audit/[propertyId]/page.tsx`

**Interfaces:**
- Consumes: nothing new — this is the symptom fix in the downstream app, independent of the package tests above (CRV does not run this package's test suite).

- [ ] **Step 1: Remove the wrongly auto-inserted static export**

In `/Volumes/External/clarivant/CRV/src/app/[locale]/audit/[propertyId]/page.tsx`, delete these two lines (currently lines 19-20):

```tsx
// Auto-inserted by cloudflare-next-intl's checkDynamicPages (mode: "fix") — remove this line, or set `dynamic` yourself, to override.
export const dynamic = "force-static";
```

so the file goes straight from the last import (`propertyIdFromParam`) to the blank line before `generateMetadata`. On vinext (CRV's runtime — see `vite.config.ts`), a page with no explicit `dynamic` export is never prerendered by default, which is the correct behavior here: this page's content (via `AuditContent` → `accessible_property_repository`/`audit_draft_repository` → `getAuthUser()`) is per-authenticated-user and must never be served from a static/shared cache.

- [ ] **Step 2: Verify no other page in CRV has the same bad auto-insert**

Run (from `/Volumes/External/clarivant/CRV`):

```bash
grep -rl "checkDynamicPages's checkDynamicPages (mode: \"fix\")" src/app 2>/dev/null
```

(If the grep above finds no matches other than the one just fixed, no further action is needed. If it finds others, read each one: confirm whether the page or anything it imports calls `getAuthUser()`/`useAuthUser()`/`cookies()`/`headers()` — per this plan's Task 1-3 fix, once `cloudflare-next-intl` is rebuilt/republished with those changes and CRV's next `vite dev`/build runs, the auto-fixer will correct any remaining bad entries on its own; this manual step is only to confirm none are silently serving stale per-user data before that happens.)

- [ ] **Step 3: Confirm the app still builds/type-checks**

Run (from `/Volumes/External/clarivant/CRV`): `npx tsc --noEmit`
Expected: no new errors introduced by the two deleted lines.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/audit/[propertyId]/page.tsx"
git commit -m "fix: remove wrongly auto-inserted force-static from the audit page

This page's content is authenticated per-user (AuditContent -> repositories
-> getAuthUser(), which reads cookies()), invisible to the previous
single-file text scan that inserted force-static. See cloudflare-next-intl's
transitive-dynamic-detection fix."
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the `getAuthUser`/`useAuthUser`/`withUserDb` direct-signal gap (including the "user DB" case the plan was expanded to cover — a call site with no cookies/headers/auth text of its own, only a per-user DB query); Tasks 2-3 cover the transitive-import gap (the actual root cause of the CRV bug, since `getAuthUser()` is called two files away from `page.tsx`, not in it); Task 4 wires both into the public `checkDynamicPages` API with an opt-out (`resolveImports: false`) preserving old behavior; Task 5 fixes the already-shipped symptom.
- **Placeholder scan:** every step has runnable code and exact run commands; no "add appropriate handling"-style steps.
- **Type consistency:** `AliasConfig` is defined once in `resolve_local_imports.ts` (Task 2) and only ever imported (`check_dynamic_pages.ts`, `trace_dynamic_usage.ts`), never redefined. `DynamicDetectionResult` (from `detect_dynamic_usage.ts`) is reused as `traceDynamicUsage`'s return type rather than a new duplicate shape. `TraceDynamicUsageIo`'s `{ readFile, isFile? }` matches exactly how `check_dynamic_pages.ts` calls it in Task 4 Step 3.
