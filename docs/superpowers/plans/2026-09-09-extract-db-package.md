# Extract `@cloudflare-next-intl/db` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/cloudflare-next-intl/src/db/**` out of `cloudflare-next-intl` into its own publishable, framework-agnostic npm package (`@cloudflare-next-intl/db`), so it can be imported by non-Next.js consumers — a Deno Supabase Edge Function in particular — without pulling in `react`, `next`, or the main package's Firebase Auth server module. `cloudflare-next-intl`'s own `./db*` subpaths keep resolving to the exact same names/signatures they do today, delegating to the new package.

**Architecture:** New sibling package `packages/db/` (repo-root sibling of `packages/cloudflare-next-intl/` and `example/`, following the same plain `file:` dependency convention `example/package.json` already uses for `packages/cloudflare-next-intl/` — no npm workspaces introduced). It owns all Postgres/Drizzle/Supabase transport logic with **zero** dependency on React, Next.js, or `cloudflare-next-intl`'s Firebase Auth module — the one coupling point (resolving the signed-in Firebase user for `withUserDb`) becomes a plain injectable callback (`DbConfig.resolveAuthUser`) instead of a dynamic `import('../firebase_auth/...')`. `packages/cloudflare-next-intl/src/db/**` shrinks to a thin wrapper: it still does the `@intl-config` auto-lookup and still wires up the real Firebase resolver, then delegates to `@cloudflare-next-intl/db`.

**Tech Stack:** TypeScript (`tsc` build, same as `packages/cloudflare-next-intl/`), Vitest (100% per-file coverage, same thresholds as `packages/cloudflare-next-intl/`), Drizzle ORM, `@supabase/supabase-js`, `pg`, `drizzle-kit`, `embedded-postgres` (dev/test only).

**Spec:** No prior spec doc exists for this exact task — the closest prior art is `docs/superpowers/specs/2026-08-30-install-size-reduction.md` (dependency-size investigation for this same package; establishes the hard constraints below) and `.agent/.sub-rules/packages/{package-authoring,structure,db}.md` (this repo's package-authoring conventions). This plan is the spec.

## Global Constraints

- **Never break `cloudflare-next-intl`'s public API.** Every existing `package.json#exports` subpath (`./db`, `./dbHelpers`, `./dbSchema`, `./dbTesting`, `./dbEslint`) keeps pointing at the same `dist/src/db/*.js` paths, exporting the exact same names (`withPublicDb`, `withUserDb`, `resolveUserDbCredentials`, `withDbClient`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`, `DrizzleDb`, `DbRoutingConfig`, `TransactionResult`, `UserDbCredentials`) with the exact same call signatures. Existing consumers change nothing.
- **Never move a package out of `dependencies`** in either package's `package.json` as a size-optimization move (`.agent/.sub-rules/packages/package-authoring.md`). Removing `pg`/`drizzle-orm`/`drizzle-kit`/`embedded-postgres`/`@supabase/supabase-js` from `packages/cloudflare-next-intl/package.json`'s `dependencies` in Task 11 is **not** this — it is removing them because the code that used them no longer lives in that package (verified: every reference to those four packages inside `packages/cloudflare-next-intl/src/**` and `packages/cloudflare-next-intl/bin/**` is inside `src/db/**` or `bin/db_*.mjs`/`ephemeral_pg.mjs`, all moving to `packages/db/`), not a placement reclassification of code that stays.
- **Never remove `README.md` or `llms.txt`** from either package's `files` field or tarball.
- `packages/db` gets its own `check:size`/`check:exports` scripts (`packages/db/scripts/`), mirroring `packages/cloudflare-next-intl/scripts/{check_size,check_exports}.mjs`.
- 100% per-file test coverage on `packages/db/src/**`, matching `packages/cloudflare-next-intl/`'s existing `min_coverage: 100` / `min_overall_coverage: 99` CI thresholds.
- Every moved file that only needs an import-path edit (`../types/types.js` -> `./types.js`, etc.) is **not** rewritten with full red/green TDD steps — its existing test file already proves it correct; the task's own "run the suite" step is the verification. Full TDD (failing test first) is used only for genuinely new logic: `memoize_by_ref.ts`, `resolve_env.ts`, the `resolveAuthUser` callback rewrite (4 call sites), and the `packages/cloudflare-next-intl/src/db/**` wrapper.

---

## File Structure

```
packages/db/                          # NEW — @cloudflare-next-intl/db
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.mts
├── README.md
├── llms.txt
├── LICENSE                          # copy of packages/cloudflare-next-intl/LICENSE (MIT)
├── .gitignore                       # copy of packages/cloudflare-next-intl/.gitignore
├── scripts/
│   ├── write_dist_type.mjs          # copy of packages/cloudflare-next-intl/scripts/write_dist_type.mjs
│   ├── check_exports.mjs            # copy of packages/cloudflare-next-intl/scripts/check_exports.mjs, no @intl-config skip needed
│   └── check_size.mjs               # copy of packages/cloudflare-next-intl/scripts/check_size.mjs, empty BANNED map
├── bin/
│   ├── db_codegen.mjs                # moved from packages/cloudflare-next-intl/bin/
│   ├── db_install_exec.mjs           # moved from packages/cloudflare-next-intl/bin/
│   ├── ddl_order.mjs                 # moved from packages/cloudflare-next-intl/bin/
│   ├── ephemeral_pg.mjs              # moved from packages/cloudflare-next-intl/bin/
│   └── install_exec_step.mjs         # moved from packages/cloudflare-next-intl/bin/
├── supabase/
│   ├── cfni_exec.sql                 # moved from packages/cloudflare-next-intl/supabase/
│   └── tests/cfni_exec.sql           # moved from packages/cloudflare-next-intl/supabase/tests/
└── src/
    ├── types.ts                      # NEW — trimmed local copy of the db-relevant types
    ├── memoize_by_ref.ts             # NEW — WeakMap memoizer, replaces `cache` from 'react'
    ├── resolve_env.ts                # NEW — local copy of geo.ts's resolveEnv (env/getCloudflareContext only)
    ├── error_handling/
    │   ├── report_error.ts           # copy of packages/cloudflare-next-intl/src/error_handling/report_error.ts
    │   ├── format_error_message.ts   # copy
    │   ├── stringify_unknown.ts      # copy
    │   └── default_ignored_console_errors.ts  # copy
    ├── require_config.ts             # moved, import path only
    ├── resolve_config_value.ts       # moved, import path only
    ├── resolve_hyperdrive_connection_string.ts  # moved, resolveEnv import -> local
    ├── resolve_mode.ts               # moved, `cache` -> memoizeByRef
    ├── connection.ts                 # moved, reportError import -> local copy
    ├── access_token.ts               # moved, rewritten to use `config.resolveAuthUser`
    ├── encode_param.ts               # moved, import path only
    ├── inline_params.ts              # moved, import path only
    ├── sql_tokens.ts                 # moved, import path only
    ├── parse_composite.ts            # moved, import path only
    ├── parse_where.ts                # moved, import path only
    ├── parse_statement.ts            # moved, import path only
    ├── unsupported_sql.ts            # moved, import path only
    ├── rest_filters.ts               # moved, import path only
    ├── rest_execute.ts               # moved, import path only
    ├── rest_client.ts                # moved, `cache` -> memoizeByRef
    ├── supabase_config.ts            # moved, import path only
    ├── supabase_transport.ts         # moved, import path only
    ├── transaction_batch.ts          # moved, import path only
    ├── resolve_raw_sql.ts            # moved, import path only
    ├── resolve_db_config.ts          # DELETED — no @intl-config in this package (see Task 7)
    ├── context.ts                    # moved, rewritten to use `config.resolveAuthUser` (3 call sites)
    ├── testing.ts                    # moved, no changes (pure)
    ├── schema.ts                     # moved, no changes (pure)
    ├── helpers.ts                    # moved, no changes (pure)
    ├── eslint_config.ts              # moved, restricted-import pattern updated
    ├── codegen_paths.ts              # moved, import path only
    ├── install_exec.ts               # moved, no changes (pure, node:fs/node:path only)
    └── index.ts                      # NEW barrel — see Task 7

packages/cloudflare-next-intl/                              # cloudflare-next-intl — MODIFIED
├── package.json                      # + "@cloudflare-next-intl/db": "file:../db"; - pg/drizzle-orm/drizzle-kit/embedded-postgres/@supabase/supabase-js
├── bin/
│   ├── db_codegen.mjs                 # replaced with a 3-line re-exec shim
│   └── db_install_exec.mjs            # replaced with a 3-line re-exec shim
├── scripts/check_size.mjs             # no BANNED change needed (nothing banned reappears)
└── src/
    ├── types/types.ts                 # DbRoutingConfig/SupabaseDbConfig/FallibleConfigValue re-exported from @cloudflare-next-intl/db
    └── db/
        ├── index.ts                   # unchanged export list, delegates to @cloudflare-next-intl/db
        ├── resolve_db_config.ts       # unchanged (still does @intl-config lookup) + now also builds resolveAuthUser
        ├── context.ts                 # SHRUNK to a thin wrapper (~60 lines) delegating to packages/db
        ├── connection.ts              # SHRUNK to re-exports of packages/db's withDbClient/connectToPostgres/etc.
        ├── access_token.ts            # DELETED (packages/db owns this now)
        ├── helpers.ts                 # re-export from @cloudflare-next-intl/db
        ├── schema.ts                  # re-export from @cloudflare-next-intl/db
        ├── testing.ts                 # re-export from @cloudflare-next-intl/db
        └── eslint_config.ts           # re-export from @cloudflare-next-intl/db (message text unchanged)
```

---

### Task 1: Scaffold `packages/db/` and prove the build/test/publish-check pipeline with one real file

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/tsconfig.build.json`, `packages/db/vitest.config.ts`, `packages/db/eslint.config.mts`, `packages/db/README.md`, `packages/db/llms.txt`, `packages/db/LICENSE`, `packages/db/.gitignore`
- Create: `packages/db/scripts/write_dist_type.mjs`, `packages/db/scripts/check_exports.mjs`, `packages/db/scripts/check_size.mjs`
- Create: `packages/db/src/schema.ts` (copy of `packages/cloudflare-next-intl/src/db/schema.ts`, byte-identical — it has no cross-file imports beyond `drizzle-orm`)
- Test: `packages/db/src/schema.test.ts` (copy of `packages/cloudflare-next-intl/src/db/schema.test.ts`, byte-identical)

**Interfaces:**
- Produces: `packages/db/package.json` with `"exports"` containing `"./schema": { "types": "./dist/src/schema.d.ts", "import": "./dist/src/schema.js" }` — later tasks add more subpaths to this same map. Package name: `@cloudflare-next-intl/db`, version `0.1.0`.

- [ ] **Step 1: Copy `schema.ts` + its test verbatim**

```bash
mkdir -p packages/db/src
cp packages/cloudflare-next-intl/src/db/schema.ts packages/db/src/schema.ts
cp packages/cloudflare-next-intl/src/db/schema.test.ts packages/db/src/schema.test.ts
```

Confirm no edits are needed — `schema.ts` only imports from `drizzle-orm`:

```bash
grep -n "^import" packages/db/src/schema.ts
```

Expected: only `drizzle-orm` imports, nothing under `../`.

- [ ] **Step 2: Write `packages/db/package.json`**

```json
{
  "name": "@cloudflare-next-intl/db",
  "version": "0.1.0",
  "description": "Framework-agnostic Postgres/Drizzle/Supabase data-access layer extracted from cloudflare-next-intl — no React, Next.js, or Firebase dependency.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "sideEffects": false,
  "bin": {
    "cfni-db-codegen": "bin/db_codegen.mjs",
    "cfni-db-install-exec": "bin/db_install_exec.mjs"
  },
  "files": ["dist", "bin", "supabase", "LICENSE", "README.md", "llms.txt"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./helpers": { "types": "./dist/src/helpers.d.ts", "import": "./dist/src/helpers.js" },
    "./schema": { "types": "./dist/src/schema.d.ts", "import": "./dist/src/schema.js" },
    "./testing": { "types": "./dist/src/testing.d.ts", "import": "./dist/src/testing.js" },
    "./eslint": { "types": "./dist/src/eslint_config.d.ts", "import": "./dist/src/eslint_config.js" }
  },
  "scripts": {
    "test": "vitest run --coverage",
    "build": "rm -rf dist && tsc && node scripts/write_dist_type.mjs",
    "check:exports": "node scripts/check_exports.mjs",
    "check:size": "node scripts/check_size.mjs",
    "prepublishOnly": "npm run build && npm run check:exports && npm run check:size"
  },
  "repository": { "type": "git", "url": "git+https://github.com/demian-ilnytskyi/cloudflare-next-intl.git" },
  "keywords": ["postgres", "drizzle", "supabase", "database", "cloudflare", "deno", "edge-functions"],
  "author": "Demian Ilnutskyi",
  "license": "MIT",
  "bugs": { "url": "https://github.com/demian-ilnytskyi/cloudflare-next-intl/issues" },
  "homepage": "https://github.com/demian-ilnytskyi/cloudflare-next-intl/tree/main/packages/db#readme",
  "dependencies": {
    "@supabase/supabase-js": "^2.112.3",
    "drizzle-kit": "^0.31.10",
    "drizzle-orm": "^0.45.2",
    "embedded-postgres": "^18.4.0-beta.17",
    "pg": "^8.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.5",
    "@types/pg": "^8.23.1",
    "@vitest/coverage-v8": "^3.2.7",
    "eslint": "^9.28.0",
    "eslint-config-prettier": "^10.1.2",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.33.1",
    "vitest": "^3.0.8"
  }
}
```

- [ ] **Step 3: Write `packages/db/tsconfig.json` and `tsconfig.build.json`**

`packages/db/tsconfig.json` (same as `packages/cloudflare-next-intl/tsconfig.json` minus `jsx`/`@intl-config`/`@locale-file` paths — this package has no JSX and no `@intl-config`):

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "removeComments": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["./**/*.ts", "./**/*.d.ts"],
  "exclude": ["**/*.test.ts", "**/*.bench.ts", "vitest.setup.ts", "vitest.config.ts", "dist/**"]
}
```

`packages/db/tsconfig.build.json` — identical to `packages/cloudflare-next-intl/tsconfig.build.json`:

```json
{
    "extends": "./tsconfig.json",
    "exclude": ["src/**/*.test.ts", "test", "__mocks__"],
    "compilerOptions": {
        "rootDir": "src",
        "noEmit": false,
        "outDir": "dist/types",
        "emitDeclarationOnly": true
    }
}
```

- [ ] **Step 4: Write `packages/db/vitest.config.ts`**

Same coverage-threshold shape as `packages/cloudflare-next-intl/vitest.config.ts`, no `@intl-config` alias (this package never uses one):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
            thresholds: { perFile: true, lines: 100, functions: 100, branches: 100, statements: 100 },
        },
    },
});
```

- [ ] **Step 5: Copy `write_dist_type.mjs`, adapt `check_exports.mjs` and `check_size.mjs`**

```bash
mkdir -p packages/db/scripts
cp packages/cloudflare-next-intl/scripts/write_dist_type.mjs packages/db/scripts/write_dist_type.mjs
cp packages/cloudflare-next-intl/scripts/check_exports.mjs packages/db/scripts/check_exports.mjs
```

Edit `packages/db/scripts/check_exports.mjs`: delete the `isExpectedConsumerContextFailure` function and its call site (there is no `@intl-config` alias in this package, so every export target must import cleanly with no exceptions) — replace:

```js
      if (isExpectedConsumerContextFailure(error)) skipped.push(record);
      else failures.push(record);
```

with:

```js
      failures.push(record);
```

and delete the now-unused `isExpectedConsumerContextFailure` function and the `skipped` array/its `console.log` branch.

Create `packages/db/scripts/check_size.mjs`:

```js
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// See ../../.agent/.sub-rules/packages/package-authoring.md — add an entry
// here whenever a dependency is swapped for a lighter equivalent that must
// never silently reappear.
const BANNED = {};

const REQUIRED_FILES = ['README.md', 'llms.txt'];

const failures = [];

for (const [name, reason] of Object.entries(BANNED)) {
  if (pkg.dependencies?.[name]) failures.push(`dependency "${name}" is banned: ${reason}`);
}
for (const file of REQUIRED_FILES) {
  if (!pkg.files?.includes(file)) failures.push(`"${file}" must stay in the "files" field`);
}

if (failures.length > 0) {
  console.error('FAIL: package size policy violated\n');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`OK: ${Object.keys(pkg.dependencies ?? {}).length} dependencies, no banned packages, README.md + llms.txt ship.`);
```

- [ ] **Step 6: Write `packages/db/README.md`, `packages/db/llms.txt`, copy `LICENSE`/`.gitignore`, add `index.ts` re-exporting `schema.ts`**

`packages/db/README.md` (minimal, expanded in later tasks as subpaths land):

```markdown
# @cloudflare-next-intl/db

Framework-agnostic Postgres/Drizzle/Supabase data-access layer. Extracted
from `cloudflare-next-intl`'s `db` module so it can run anywhere plain
TypeScript runs — Deno (Supabase Edge Functions), Node, Cloudflare Workers,
Firebase Functions — with **no** dependency on React, Next.js, or Firebase
Auth. `cloudflare-next-intl`'s own `./db` subpath re-exports this package
and layers its own `@intl-config`/Firebase Auth convenience on top; use
this package directly when you have neither.

## Subpaths

- `@cloudflare-next-intl/db` — `withPublicDb`, `withUserDb`, `withDbClient`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`.
- `@cloudflare-next-intl/db/helpers` — generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …).
- `@cloudflare-next-intl/db/schema` — table builders.
- `@cloudflare-next-intl/db/testing` — `makeFakeDb` test double, no real Postgres connection needed.
- `@cloudflare-next-intl/db/eslint` — flat-config fragment banning raw driver imports.

See the parent package's `db.md` (`.agent/.sub-rules/packages/db.md`) for
the transport pipeline and supported REST subset — unchanged by this split.
```

`packages/db/llms.txt` (minimal stub, same one-paragraph-per-subpath shape as `packages/cloudflare-next-intl/llms.txt`):

```
# @cloudflare-next-intl/db

Framework-agnostic Postgres/Drizzle/Supabase data-access layer, usable from
Deno, Node, Cloudflare Workers, or any plain TypeScript project — no React,
Next.js, or Firebase dependency.

## Subpaths

import { withPublicDb, withUserDb } from "@cloudflare-next-intl/db";
import { excluded, onConflictSet, ago } from "@cloudflare-next-intl/db/helpers";
import { pgTableBuilder } from "@cloudflare-next-intl/db/schema";
import { makeFakeDb } from "@cloudflare-next-intl/db/testing";
import dbEslintConfig from "@cloudflare-next-intl/db/eslint";
```

```bash
cp packages/cloudflare-next-intl/LICENSE packages/db/LICENSE
cp packages/cloudflare-next-intl/.gitignore packages/db/.gitignore
cat > packages/db/eslint.config.mts <<'EOF'
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    { ignores: ['dist/**'] },
);
EOF
cat > packages/db/src/index.ts <<'EOF'
export * from './schema.js';
EOF
```

- [ ] **Step 7: Install, build, test, run publish checks**

```bash
cd packages/db && npm install && npm run build && npm test && npm run check:exports && npm run check:size
```

Expected: `tsc` emits `dist/index.js` + `dist/src/schema.js` cleanly, `vitest run --coverage` passes with 100% coverage on `schema.ts` (its existing test already does this in `packages/cloudflare-next-intl/`), `check:exports` reports `OK: 2/2 export targets import cleanly` (no `@intl-config` skip line — there is none in this package), `check:size` reports `OK: 5 dependencies, no banned packages, README.md + llms.txt ship.`

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): scaffold @cloudflare-next-intl/db, move schema.ts as proof of pipeline"
```

---

### Task 2: Move `types.ts`, `require_config.ts`, `resolve_config_value.ts`

**Files:**
- Create: `packages/db/src/types.ts` (new, trimmed local copy of `packages/cloudflare-next-intl/src/types/types.ts`'s db-relevant slice)
- Create: `packages/db/src/require_config.ts`, `packages/db/src/resolve_config_value.ts` (moved, import path only)
- Test: `packages/db/src/require_config.test.ts`, `packages/db/src/resolve_config_value.test.ts` (moved verbatim)

**Interfaces:**
- Produces: `packages/db/src/types.ts` exporting `DbRoutingConfig`, `SupabaseDbConfig`, `FallibleConfigValue<T>`, `ConfigValue<T>`, `GenerateRoutingConfig` (trimmed — `env`/`ctx`/`getCloudflareContext` only), `ErrorHandlingRoutingConfig` (trimmed — the fields `report_error.ts` actually reads), `ErrorHandlingParams`, `AuthUserResolverResult`. Later tasks (`connection.ts`, `context.ts`, `resolve_mode.ts`, `rest_client.ts`, `access_token.ts`, `resolve_hyperdrive_connection_string.ts`) import types from here instead of `../types/types.js`.

- [ ] **Step 1: Write `packages/db/src/types.ts`**

```ts
/**
 * Local, trimmed copy of `cloudflare-next-intl`'s `RoutingConfig` types —
 * only the fields the db transport actually reads. Deliberately duplicated
 * rather than imported: this package has no dependency on
 * `cloudflare-next-intl` (that would be circular — the main package depends
 * on THIS one), and the main package's `src/types/types.ts` re-exports
 * `DbRoutingConfig`/`SupabaseDbConfig`/`FallibleConfigValue` from here
 * instead (see Task 11) so the two stay in sync at the type level.
 */

export type ConfigValue<T> = T | (() => T | Promise<T>);

/**
 * A {@link ConfigValue} whose function form may also return `null`/`undefined`
 * to mean "this source has nothing — fall through to the next one".
 */
export type FallibleConfigValue<T> = ConfigValue<T | null | undefined>;

export interface SupabaseDbConfig {
    /** Supabase project URL, e.g. `https://abc.supabase.co`. */
    url?: FallibleConfigValue<string>;
    /** Supabase anon (publishable) key — never a service-role key. */
    anonKey?: FallibleConfigValue<string>;
    /** Name of the Postgres function that runs generated SQL. Defaults to `'cfni_exec'`. */
    execFunction?: string;
    /** `false` when `cfni_exec` is not installed — see package README. Defaults to `true`. */
    rawSql?: boolean;
}

/**
 * Resolved from the caller's own auth system (e.g. Firebase Auth) by a
 * `DbConfig.resolveAuthUser` callback the CALLER supplies. This package
 * never resolves this itself — it has no auth SDK dependency at all.
 */
export interface AuthUserResolverResult {
    uid: string | null;
    getIdToken: (forceRefresh?: boolean) => Promise<string | null | undefined>;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
}

export interface DbRoutingConfig {
    connectionString?: FallibleConfigValue<string>;
    autoHyperdrive?: boolean;
    autoHyperdriveSkipUrls?: string[];
    /** @deprecated Ignored since 0.8.23 — every call opens and closes its own client. */
    disconnectAfterRequest?: boolean;
    authenticatedRole?: string | (() => string | Promise<string>);
    authenticatedRoleClaim?: string | false;
    getUserId?: () => Promise<string | null> | string | null;
    getAccessToken?: () => Promise<string | null> | string | null;
    supabase?: SupabaseDbConfig;
}

/** The slice of `GenerateRoutingConfig` the db transport reads. */
export interface GenerateRoutingConfig {
    env?: object | Record<string, unknown> | (() => object | Record<string, unknown> | Promise<object | Record<string, unknown>>);
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void } | (() => { waitUntil?: (promise: Promise<unknown>) => void } | undefined);
    getCloudflareContext?: (opts: { async: true }) => Promise<{ env?: Record<string, unknown>; ctx?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined>;
}

/** The slice of `ErrorHandlingRoutingConfig` `report_error.ts` reads. */
export interface ErrorHandlingRoutingConfig {
    enable?: boolean;
    onError?: (params: ErrorHandlingParams) => void | Promise<void>;
    logToConsole?: boolean;
    ignoreConsoleErrors?: readonly string[];
    ignoreConsoleError?: (stringified: string) => boolean;
    dedup?: boolean;
    throttleMs?: number;
    resetDedup?: boolean;
}

export interface ErrorHandlingParams {
    error: unknown;
    classOrMethodName: string;
    params?: unknown;
    isClient?: boolean;
    consent?: boolean | undefined;
    formattedMessage?: string;
    dedupKey?: string;
}

/**
 * The config every `db` export reads. `resolveAuthUser` is this package's
 * only auth hook — supply it to back `withUserDb`'s uid/token/role
 * resolution with whatever auth system you use; omit it to require
 * `db.getUserId`/`db.getAccessToken`/an explicit credential instead.
 */
export interface DbConfig {
    db?: DbRoutingConfig;
    generate?: GenerateRoutingConfig;
    errorHandling?: ErrorHandlingRoutingConfig;
    resolveAuthUser?: () => Promise<AuthUserResolverResult | null>;
}
```

- [ ] **Step 2: Move `require_config.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/require_config.ts packages/db/src/require_config.ts
cp packages/cloudflare-next-intl/src/db/require_config.test.ts packages/db/src/require_config.test.ts
```

Edit `packages/db/src/require_config.ts` — change:
```ts
import type { DbRoutingConfig } from '../types/types.js';
```
to:
```ts
import type { DbRoutingConfig } from './types.js';
```

- [ ] **Step 3: Move `resolve_config_value.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/resolve_config_value.ts packages/db/src/resolve_config_value.ts
cp packages/cloudflare-next-intl/src/db/resolve_config_value.test.ts packages/db/src/resolve_config_value.test.ts
```

Edit `packages/db/src/resolve_config_value.ts` — change:
```ts
import type { FallibleConfigValue } from '../types/types.js';
```
to:
```ts
import type { FallibleConfigValue } from './types.js';
```

- [ ] **Step 4: Build and test**

```bash
cd packages/db && npm run build && npm test
```

Expected: still green, 100% coverage on the 4 new files (`types.ts` has no runtime code to cover — add it to `vitest.config.ts`'s coverage `exclude` alongside `index.ts`).

Edit `packages/db/vitest.config.ts`'s `coverage.exclude` array to:
```ts
exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/types.ts'],
```

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): add local types.ts, move require_config and resolve_config_value"
```

---

### Task 3: New `memoize_by_ref.ts`, new `resolve_env.ts`, move `resolve_hyperdrive_connection_string.ts` + `resolve_mode.ts`

This is the task that removes the `react` dependency. `resolve_mode.ts` and `rest_client.ts` (Task 6) both memoize an async function per-request with React's `cache()`; `resolve_hyperdrive_connection_string.ts` transitively needs `resolveEnv` from the main package's `server/functions/geo.ts`, itself `cache()`-memoized and carrying a `@intl-config` dynamic import. Both problems are solved by one small local module.

**Files:**
- Create: `packages/db/src/memoize_by_ref.ts`
- Test: `packages/db/src/memoize_by_ref.test.ts`
- Create: `packages/db/src/resolve_env.ts`
- Test: `packages/db/src/resolve_env.test.ts`
- Create: `packages/db/src/resolve_hyperdrive_connection_string.ts`, `packages/db/src/resolve_mode.ts` (moved, edited)
- Test: `packages/db/src/resolve_hyperdrive_connection_string.test.ts`, `packages/db/src/resolve_mode.test.ts` (moved, edited to not reference `react`)

**Interfaces:**
- Produces: `memoizeByRef<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<R>` — memoizes by the identity of `args[0]` (a `WeakMap` keyed on the first argument, which in every call site here is the `db`/`generate` config object itself — a stable reference for the lifetime of one request, exactly matching what `cache()` bought). Consumed by `resolve_mode.ts` and (Task 6) `rest_client.ts`.
- Produces: `resolveEnv(generate?: GenerateRoutingConfig): Promise<Record<string, unknown> | undefined>` — same contract as the main package's `server/functions/geo.ts#resolveEnv`, minus the `@intl-config` fallback (this package never has one) and minus React memoization (uses `memoizeByRef` instead).

- [ ] **Step 1: Write the failing test for `memoizeByRef`**

```ts
// packages/db/src/memoize_by_ref.test.ts
import { describe, it, expect, vi } from 'vitest';
import memoizeByRef from './memoize_by_ref.js';

describe('memoizeByRef', () => {
    it('calls the underlying function once for the same first-argument reference', async () => {
        const fn = vi.fn(async (key: object, extra: number) => extra * 2);
        const memoized = memoizeByRef(fn);
        const key = {};

        const [a, b] = await Promise.all([memoized(key, 3), memoized(key, 3)]);

        expect(a).toBe(6);
        expect(b).toBe(6);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('calls the underlying function again for a different first-argument reference', async () => {
        const fn = vi.fn(async (key: object) => key);
        const memoized = memoizeByRef(fn);

        await memoized({});
        await memoized({});

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not cache a rejected call — a later call with the same key retries', async () => {
        let calls = 0;
        const fn = vi.fn(async (key: object) => {
            calls += 1;
            if (calls === 1) throw new Error('boom');
            return 'ok';
        });
        const memoized = memoizeByRef(fn);
        const key = {};

        await expect(memoized(key)).rejects.toThrow('boom');
        await expect(memoized(key)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/db && npx vitest run src/memoize_by_ref.test.ts
```

Expected: FAIL — `Cannot find module './memoize_by_ref.js'`.

- [ ] **Step 3: Implement `memoize_by_ref.ts`**

```ts
/**
 * Memoizes an async function keyed on the identity of its first argument —
 * a `WeakMap`-based stand-in for React's `cache()`, usable outside a React
 * render. Every caller in this package passes a stable `db`/`generate`
 * config object as that first argument, so this buys the same "resolved
 * once per config object" behaviour `cache()` gave the Next.js-only version
 * of this code, without depending on `react` at all.
 *
 * A rejected call is never cached — the next call with the same key retries
 * `fn` from scratch, matching `cache()`'s own behaviour (it does not cache
 * thrown/rejected results either).
 */
export default function memoizeByRef<Args extends [object, ...unknown[]], R>(
    fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
    const cache = new WeakMap<object, Promise<R>>();

    return (...args: Args): Promise<R> => {
        const key = args[0];
        const cached = cache.get(key);
        if (cached) return cached;

        const result = fn(...args);
        cache.set(key, result);
        result.catch(() => cache.delete(key));
        return result;
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/db && npx vitest run src/memoize_by_ref.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Write the failing test for `resolveEnv`**

```ts
// packages/db/src/resolve_env.test.ts
import { describe, it, expect, vi } from 'vitest';
import resolveEnv from './resolve_env.js';
import type { GenerateRoutingConfig } from './types.js';

describe('resolveEnv', () => {
    it('returns undefined when generate is unset', async () => {
        expect(await resolveEnv(undefined)).toBeUndefined();
    });

    it('returns generate.env directly when it is an object', async () => {
        const env = { HYPERDRIVE: { connectionString: 'postgres://x' } };
        expect(await resolveEnv({ env })).toBe(env);
    });

    it('awaits generate.env when it is a function', async () => {
        const env = { FOO: 'bar' };
        const generate: GenerateRoutingConfig = { env: async () => env };
        expect(await resolveEnv(generate)).toBe(env);
    });

    it('falls back to getCloudflareContext when env is unset', async () => {
        const ctxEnv = { HYPERDRIVE: { connectionString: 'postgres://y' } };
        const getCloudflareContext = vi.fn(async () => ({ env: ctxEnv }));
        expect(await resolveEnv({ getCloudflareContext })).toBe(ctxEnv);
        expect(getCloudflareContext).toHaveBeenCalledWith({ async: true });
    });

    it('returns undefined when getCloudflareContext throws', async () => {
        const generate: GenerateRoutingConfig = {
            getCloudflareContext: async () => { throw new Error('no context here'); },
        };
        expect(await resolveEnv(generate)).toBeUndefined();
    });

    it('returns undefined when neither env nor getCloudflareContext is set', async () => {
        expect(await resolveEnv({})).toBeUndefined();
    });

    it('memoizes by the generate object reference', async () => {
        const getCloudflareContext = vi.fn(async () => ({ env: {} }));
        const generate: GenerateRoutingConfig = { getCloudflareContext };
        await Promise.all([resolveEnv(generate), resolveEnv(generate)]);
        expect(getCloudflareContext).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
cd packages/db && npx vitest run src/resolve_env.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement `resolve_env.ts`**

```ts
import memoizeByRef from './memoize_by_ref.js';
import type { GenerateRoutingConfig } from './types.js';

/**
 * Resolves the Cloudflare environment bindings object from `generate.env`
 * or `generate.getCloudflareContext`. Local copy of
 * `cloudflare-next-intl`'s `server/functions/geo.ts#resolveEnv`, trimmed to
 * just what {@link resolveHyperdriveConnectionString} needs — this package
 * has no `@intl-config` fallback to also try, and memoizes with
 * {@link memoizeByRef} instead of React's `cache()` so it works outside a
 * React render (Deno, a plain Node script, a Cloudflare Worker with no
 * React in it at all).
 */
async function resolveEnvUncached(
    generate?: GenerateRoutingConfig,
): Promise<Record<string, unknown> | undefined> {
    if (!generate) return undefined;
    if (generate.env) {
        const resolved = typeof generate.env === 'function' ? await generate.env() : generate.env;
        return resolved as Record<string, unknown>;
    }
    if (generate.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
            return ctx?.env;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

const resolveEnv = memoizeByRef(
    async (generate?: GenerateRoutingConfig) => resolveEnvUncached(generate),
);

export default resolveEnv;
```

Note: `memoizeByRef`'s `Args extends [object, ...unknown[]]` constraint requires a non-optional first parameter type-wise; `generate` here is `GenerateRoutingConfig | undefined`, which is still a valid single positional argument (the constraint is on the tuple shape accepted by `memoizeByRef`'s wrapped function, not on excluding `undefined` as a value) — `WeakMap.get(undefined)` etc. Since `WeakMap` keys must be non-null objects, calling `resolveEnv(undefined)` needs its own short-circuit: add this guard directly in the exported wrapper instead of inside `memoizeByRef` (keeps `memoizeByRef` itself generic and dependency-free):

Replace the last two lines with:

```ts
const resolveEnvMemoized = memoizeByRef(
    async (generate: GenerateRoutingConfig) => resolveEnvUncached(generate),
);

export default async function resolveEnv(
    generate?: GenerateRoutingConfig,
): Promise<Record<string, unknown> | undefined> {
    if (!generate) return undefined;
    return resolveEnvMemoized(generate);
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd packages/db && npx vitest run src/resolve_env.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 9: Move `resolve_hyperdrive_connection_string.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/resolve_hyperdrive_connection_string.ts packages/db/src/resolve_hyperdrive_connection_string.ts
cp packages/cloudflare-next-intl/src/db/resolve_hyperdrive_connection_string.test.ts packages/db/src/resolve_hyperdrive_connection_string.test.ts
```

Edit `packages/db/src/resolve_hyperdrive_connection_string.ts` — change:
```ts
import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';
```
to:
```ts
import resolveEnv from './resolve_env.js';
import type { GenerateRoutingConfig } from './types.js';
```

Edit `packages/db/src/resolve_hyperdrive_connection_string.test.ts` — update its mock target from `'../server/functions/geo.js'` to `'./resolve_env.js'` (check the file for `vi.mock(...)` calls and update the path string; the exported member is a default export here, `resolveEnv`, vs. the main package's named export — update `vi.mock('./resolve_env.js', () => ({ default: vi.fn(...) }))` accordingly).

- [ ] **Step 10: Move `resolve_mode.ts` + test, drop `react`**

```bash
cp packages/cloudflare-next-intl/src/db/resolve_mode.ts packages/db/src/resolve_mode.ts
cp packages/cloudflare-next-intl/src/db/resolve_mode.test.ts packages/db/src/resolve_mode.test.ts
```

Edit `packages/db/src/resolve_mode.ts` — change:
```ts
import { cache } from 'react';
import type { DbRoutingConfig, GenerateRoutingConfig, SupabaseDbConfig } from '../types/types.js';
```
to:
```ts
import memoizeByRef from './memoize_by_ref.js';
import type { DbRoutingConfig, GenerateRoutingConfig, SupabaseDbConfig } from './types.js';
```
and the last line, change:
```ts
const resolveDbMode = cache(resolveDbModeUncached);
```
to:
```ts
const resolveDbMode = memoizeByRef(resolveDbModeUncached);
```

`resolveDbModeUncached(db: DbRoutingConfig, generate?: GenerateRoutingConfig)`'s first parameter `db` is already always a real object at every call site (`context.ts`/`connection.ts` always pass `config.db` after `requireDbConfig` has confirmed it's set) — no `undefined`-guard wrapper needed here, unlike `resolve_env.ts`.

Edit `packages/db/src/resolve_mode.test.ts` — remove any `vi.mock('react', ...)` setup if present; since `memoizeByRef` is real (not mocked) and pure, the existing per-call-count assertions ("memoized per request") continue to work unchanged against the real `memoizeByRef`.

- [ ] **Step 11: Build and test**

```bash
cd packages/db && npm run build && npm test
```

Expected: green, 100% coverage on all 6 new/moved files. Confirm `react` does not appear anywhere in `packages/db/src`:

```bash
grep -rln "from 'react'" packages/db/src
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): replace React cache() with memoizeByRef, add local resolveEnv"
```

---

### Task 4: Duplicate the pure `error_handling` files `report_error.ts` depends on

**Files:**
- Create: `packages/db/src/error_handling/report_error.ts`, `format_error_message.ts`, `stringify_unknown.ts`, `default_ignored_console_errors.ts` (byte-identical copies)
- Test: matching `.test.ts` copies

**Interfaces:**
- Produces: `reportError(config: ReportErrorConfig | undefined, params: ErrorHandlingParams): Promise<void>` at `packages/db/src/error_handling/report_error.ts`, same signature as the main package's version. Consumed by `connection.ts` (Task 5).

- [ ] **Step 1: Copy the four files and their tests verbatim**

```bash
mkdir -p packages/db/src/error_handling
for f in report_error format_error_message stringify_unknown default_ignored_console_errors; do
  cp "packages/cloudflare-next-intl/src/error_handling/$f.ts" "packages/db/src/error_handling/$f.ts"
  cp "packages/cloudflare-next-intl/src/error_handling/$f.test.ts" "packages/db/src/error_handling/$f.test.ts"
done
```

- [ ] **Step 2: Fix `report_error.ts`'s one cross-boundary import**

`packages/cloudflare-next-intl/src/error_handling/report_error.ts` imports:
```ts
import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
```

Edit `packages/db/src/error_handling/report_error.ts` — change that line to:
```ts
import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types.js';
```

`format_error_message.ts`, `stringify_unknown.ts`, `default_ignored_console_errors.ts` have no cross-file imports at all (confirmed: `report_error.ts` only imports these three siblings plus the one types import above) — copy them unedited.

- [ ] **Step 3: Build and test**

```bash
cd packages/db && npm run build && npm test
```

Expected: green. `report_error.ts`'s existing test suite already covers `enable: false`, `consent`, dedup, `ctx.waitUntil`, and `logToConsole` branches at 100% — no new tests needed, this is a verbatim move.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): duplicate report_error and its pure dependencies"
```

---

### Task 5: Move `connection.ts` + `access_token.ts` (the second and last `firebaseAuth` coupling points)

**Files:**
- Create: `packages/db/src/connection.ts` (moved, `reportError`/types imports only)
- Test: `packages/db/src/connection.test.ts` (moved, mock path updated)
- Create: `packages/db/src/access_token.ts` (moved, rewritten)
- Test: `packages/db/src/access_token.test.ts` (moved, rewritten)

**Interfaces:**
- Consumes: `types.ts#DbConfig/AuthUserResolverResult` (Task 2), `error_handling/report_error.ts` (Task 4), `require_config.ts` (Task 2), `resolve_config_value.ts` (Task 2), `resolve_hyperdrive_connection_string.ts` (Task 3).
- Produces: `withDbClient<T>(config: DbConfig, queryFn) => Promise<T>`, `connectToPostgres(config: DbConfig) => Promise<Client>`, `disconnectPostgres`, `resetConnectionState`, `withSessionLock` — same signatures as today, `DbConfig` now imported from `./types.js` instead of being locally declared in `connection.ts` (it moved to `types.ts` in Task 2). Consumed by `context.ts` (Task 7).
- Produces: `resolveAccessToken(config: DbConfig): Promise<string>` — same signature, now reads `config.resolveAuthUser` instead of `config.firebaseAuth` + a dynamic import. Consumed by `context.ts` (Task 7).

- [ ] **Step 1: Move `connection.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/connection.ts packages/db/src/connection.ts
cp packages/cloudflare-next-intl/src/db/connection.test.ts packages/db/src/connection.test.ts
```

Edit `packages/db/src/connection.ts`:

1. Delete the local `DbConfig` interface (lines defining `export interface DbConfig { db?...; firebaseAuth?...; generate?...; errorHandling?... }`) — it now lives in `types.ts` with `resolveAuthUser` instead of `firebaseAuth`.
2. Change the import block from:
```ts
import type * as Pg from 'pg';
import type { Client } from 'pg';
import type { DbRoutingConfig, ErrorHandlingRoutingConfig, FirebaseAuthRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
import reportError from '../error_handling/report_error.js';
import requireDbConfig from './require_config.js';
import resolveConfigValue from './resolve_config_value.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';
```
to:
```ts
import type * as Pg from 'pg';
import type { Client } from 'pg';
import type { DbConfig, DbRoutingConfig, GenerateRoutingConfig } from './types.js';
import reportError from './error_handling/report_error.js';
import requireDbConfig from './require_config.js';
import resolveConfigValue from './resolve_config_value.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';
```

Every other line in `connection.ts` (`resolveConnectionString`, `resetSessionState`, `withDbClient`, `resetConnectionState`, `withSessionLock`, `connectToPostgres`, `disconnectPostgres`, the `BENIGN_DISCONNECT_PATTERN` regex, the `loadPg` lazy `pg` import) is unchanged — none of it touches `firebaseAuth` or React.

Edit `packages/db/src/connection.test.ts` — update any `vi.mock('../error_handling/report_error.js', ...)` to `vi.mock('./error_handling/report_error.js', ...)`, and any `vi.mock('../types/types.js', ...)`/local `DbConfig` type-only construction sites to import from `./types.js`. Remove any test case that specifically exercises `firebaseAuth`-related behavior inside `connection.ts` — grep confirms `connection.ts` itself never reads `config.firebaseAuth` (only `context.ts`/`access_token.ts` do), so no such test case should exist here; if `connection.test.ts` builds a `DbConfig` fixture that includes a `firebaseAuth` field for realism, just drop that field from the fixture object.

- [ ] **Step 2: Run connection tests**

```bash
cd packages/db && npx vitest run src/connection.test.ts
```

Expected: PASS at 100% coverage — this file's logic is unchanged, only import paths moved.

- [ ] **Step 3: Write the failing test for the rewritten `access_token.ts`**

```ts
// packages/db/src/access_token.test.ts (replaces the moved copy)
import { describe, it, expect } from 'vitest';
import resolveAccessToken from './access_token.js';
import type { DbConfig } from './types.js';

describe('resolveAccessToken', () => {
    it('throws when db is not configured', async () => {
        await expect(resolveAccessToken({})).rejects.toThrow(/db.*not.*configured|db: /i);
    });

    it('returns db.getAccessToken() when it resolves a token', async () => {
        const config: DbConfig = { db: { getAccessToken: () => 'token-from-config' } };
        expect(await resolveAccessToken(config)).toBe('token-from-config');
    });

    it('falls back to resolveAuthUser when getAccessToken is unset', async () => {
        const config: DbConfig = {
            db: {},
            resolveAuthUser: async () => ({
                uid: 'u1',
                getIdToken: async () => 'token-from-auth-user',
                getIdTokenResult: async () => ({ claims: {} }),
            }),
        };
        expect(await resolveAccessToken(config)).toBe('token-from-auth-user');
    });

    it('throws when neither getAccessToken nor resolveAuthUser yields a token', async () => {
        const config: DbConfig = { db: {}, resolveAuthUser: async () => null };
        await expect(resolveAccessToken(config)).rejects.toThrow(
            /could not resolve an access token/,
        );
    });

    it('throws when resolveAuthUser is unset and getAccessToken yields nothing', async () => {
        const config: DbConfig = { db: {} };
        await expect(resolveAccessToken(config)).rejects.toThrow(
            /could not resolve an access token/,
        );
    });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd packages/db && npx vitest run src/access_token.test.ts
```

Expected: FAIL — module not found (file not yet moved/rewritten).

- [ ] **Step 5: Move and rewrite `access_token.ts`**

```bash
cp packages/cloudflare-next-intl/src/db/access_token.ts packages/db/src/access_token.ts
```

Replace its whole body:

```ts
import type { DbConfig } from './types.js';
import requireDbConfig from './require_config.js';

/**
 * Resolves the JWT that identifies the caller to Supabase, trying
 * `db.getAccessToken()` first, then `config.resolveAuthUser()` (the
 * caller's own auth-system hook — the main `cloudflare-next-intl` package
 * wires this to Firebase Auth automatically; a standalone caller supplies
 * its own or omits it).
 *
 * PostgREST reads this token to pick the caller's role and populate
 * `request.jwt.claims`, which is what makes RLS behave the same as it does
 * in connection-string mode.
 *
 * @param config Your db config; `config.db` must be set.
 * @returns The bearer token to send with the request.
 * @throws If `db` is not set, or no token can be resolved.
 */
export default async function resolveAccessToken(config: DbConfig): Promise<string> {
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getAccessToken?.();
    if (fromConfig) return fromConfig;
    if (config.resolveAuthUser) {
        const authUser = await config.resolveAuthUser();
        const token = await authUser?.getIdToken(false);
        if (token) return token;
    }
    throw new Error(
        'db: withUserDb could not resolve an access token for Supabase. Set ' +
        '`db.getAccessToken`, or `config.resolveAuthUser` so a signed-in ' +
        "user's token is used.",
    );
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd packages/db && npx vitest run src/access_token.test.ts
```

Expected: PASS, 5/5, 100% coverage.

- [ ] **Step 7: Build full package**

```bash
cd packages/db && npm run build && npm test
```

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): move connection.ts, rewrite access_token.ts around resolveAuthUser"
```

---

### Task 6: Move the pure SQL-parsing/REST-transport batch (13 files)

These 13 files' only cross-boundary import is `../types/types.js` (or, for `rest_client.ts`, also `react`'s `cache` — handled the same way as Task 3). None of them touch Firebase, Next.js, or `@intl-config`. Verified via `grep -rn "^import\|from '\.\./" src/db/*.ts` in the source repo (see plan research) — no other cross-boundary imports exist among this batch.

**Files:**
- Create (moved, import path only): `packages/db/src/encode_param.ts`, `inline_params.ts`, `sql_tokens.ts`, `parse_composite.ts`, `parse_where.ts`, `parse_statement.ts`, `unsupported_sql.ts`, `rest_filters.ts`, `rest_execute.ts`, `supabase_config.ts`, `supabase_transport.ts`, `transaction_batch.ts`, `resolve_raw_sql.ts`
- Create (moved, `react` removed): `packages/db/src/rest_client.ts`
- Test: matching `.test.ts` for all 14, moved verbatim except `rest_client.test.ts`

**Interfaces:**
- Produces: `createRestClient`, `RestClient`, `RestQueryBuilder`, `RestQueryResult<T>` (`rest_client.ts`); `createSupabaseTransport`, `ExecResult` (`supabase_transport.ts`); `resolveSupabaseEndpoint` (`supabase_config.ts`); `runTransactionBatch`, `BatchQuery` (`transaction_batch.ts`); `inlineParams` (`inline_params.ts`) — all consumed by `context.ts` (Task 7).

- [ ] **Step 1: Move the 12 files whose only change is the types import path**

```bash
for f in encode_param inline_params sql_tokens parse_composite parse_where parse_statement unsupported_sql rest_filters rest_execute supabase_config supabase_transport transaction_batch resolve_raw_sql; do
  cp "packages/cloudflare-next-intl/src/db/$f.ts" "packages/db/src/$f.ts"
  cp "packages/cloudflare-next-intl/src/db/$f.test.ts" "packages/db/src/$f.test.ts"
done
```

For each of these files, run:

```bash
grep -l "from '\.\./types/types.js'" packages/db/src/*.ts
```

and for every match, replace `from '../types/types.js'` with `from './types.js'` (this is every file in this list that has a type-only import at all — confirmed against the source repo's import list; several of these files, like `encode_param.ts`, `inline_params.ts`, `sql_tokens.ts`, `parse_composite.ts`, `parse_where.ts`, `unsupported_sql.ts`, `rest_execute.ts`, have **no** cross-boundary import at all and need no edit — verify per-file with the same `grep` before editing, don't blind-`sed` files that don't match).

- [ ] **Step 2: Move and edit `rest_client.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/rest_client.ts packages/db/src/rest_client.ts
cp packages/cloudflare-next-intl/src/db/rest_client.test.ts packages/db/src/rest_client.test.ts
```

Edit `packages/db/src/rest_client.ts` — change:
```ts
import { cache } from 'react';
import type { SupabaseDbConfig } from '../types/types.js';
```
to:
```ts
import memoizeByRef from './memoize_by_ref.js';
import type { SupabaseDbConfig } from './types.js';
```

Find the `cache(...)`-wrapped function later in the file (per the `db.md` docs, this backs "per request reuses of the `@supabase/supabase-js` client") and change its wrapping call from `cache(...)` to `memoizeByRef(...)`, same substitution pattern as Task 3 Step 10. Update `rest_client.test.ts` the same way Task 3's `resolve_mode.test.ts` was updated (drop any `react` mock, keep the call-count assertions against the real `memoizeByRef`).

- [ ] **Step 3: Build and test**

```bash
cd packages/db && npm run build && npm test
```

Expected: green, 100% coverage across all 14 files.

- [ ] **Step 4: Confirm zero remaining `react`/`../types/types.js`/`../server/`/`../firebase_auth/`/`../config/` references anywhere in `packages/db/src`**

```bash
grep -rln "from 'react'\|from '\.\./types\|from '\.\./server\|from '\.\./firebase_auth\|from '\.\./config" packages/db/src
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): move SQL parsing and REST transport files"
```

---

### Task 7: Rewrite `context.ts` around `resolveAuthUser`, move `testing.ts` and `helpers.ts`, write the barrel `index.ts`

This is the last and largest logic change: `context.ts`'s three Firebase dynamic-import call sites (`resolveUserDbCredentials`, `resolveUserId`, `resolveAuthenticatedRole`) become `config.resolveAuthUser()` calls. Everything else in `context.ts` (`withPublicDb`, `withUserDb`, the RLS session-state proxy, transaction batching, `supabaseDb`/`postgresDb`/`buildOnlyDb`/`callBuild`/`runPostgresTransaction`/`runTransaction`/`injectUidComment`) is unchanged business logic — moved verbatim.

**Files:**
- Create: `packages/db/src/context.ts` (moved, 3 call sites rewritten)
- Test: `packages/db/src/context.test.ts`, `packages/db/src/build_only_db.test.ts` (moved, mocks updated)
- Create: `packages/db/src/testing.ts` (moved, unchanged — pure), `packages/db/src/helpers.ts` (moved, unchanged — pure)
- Test: `packages/db/src/testing.test.ts` (moved, unchanged), `packages/db/src/helpers.test.ts` (moved, unchanged)
- Create: `packages/db/src/index.ts` (new barrel, replaces the Task 1 stub)
- Test: `packages/db/src/index.test.ts` (moved, adapted)

**Interfaces:**
- Consumes: everything from Tasks 2–6 (`types.ts`, `connection.ts#withDbClient`, `resolve_db_config` — **not** consumed, see Step 1 note — `resolve_mode.ts#resolveDbMode`, `supabase_config.ts#resolveSupabaseEndpoint`, `supabase_transport.ts#createSupabaseTransport`, `access_token.ts#resolveAccessToken`, `transaction_batch.ts#runTransactionBatch`, `inline_params.ts#inlineParams`, `require_config.ts#requireDbConfig`).
- Produces: `withPublicDb<T>(fn, dbConfig: DbConfig) => Promise<T>`, `withUserDb<T>(fn, auth, dbConfig: DbConfig) => Promise<T>`, `resolveUserDbCredentials(dbConfig: DbConfig) => Promise<UserDbCredentials>`, types `DrizzleDb`, `UserDbCredentials`, `TransactionResult` — **note the signature change**: the third/second parameter, `dbOverride?: DbRoutingConfig` in the current main-package code, becomes a **required** `dbConfig: DbConfig` here (this package has no `@intl-config` to fall back to). `packages/cloudflare-next-intl/src/db/context.ts` (Task 11) is what re-introduces the optional/`@intl-config`-backed signature existing consumers rely on.
- Produces (barrel): `packages/db/src/index.ts` re-exports `withPublicDb`, `withUserDb`, `resolveUserDbCredentials`, `withDbClient`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`, `withSessionLock`, and types `DrizzleDb`, `UserDbCredentials`, `TransactionResult`, `DbConfig`, `DbRoutingConfig`, `SupabaseDbConfig`, `AuthUserResolverResult`.

- [ ] **Step 1: Delete `resolve_db_config.ts` from the move list — it is not moved**

Confirm it is not copied — `packages/cloudflare-next-intl/src/db/resolve_db_config.ts`'s entire job is the `@intl-config` dynamic import, which has no equivalent in this package. `packages/db`'s `withPublicDb`/`withUserDb`/`resolveUserDbCredentials` all take a plain, already-resolved `DbConfig` object directly — there is nothing left for a `resolve_db_config.ts` in this package to do. (`packages/cloudflare-next-intl/src/db/resolve_db_config.ts` keeps existing, unchanged in its own package — Task 11.)

- [ ] **Step 2: Write the failing test for the rewritten Firebase-auth call sites**

Add these cases to the moved `packages/db/src/context.test.ts` (find its existing `resolveUserDbCredentials`/`withUserDb` describe blocks and add alongside):

```ts
describe('resolveUserDbCredentials with resolveAuthUser', () => {
    it('resolves uid/accessToken/role from config.resolveAuthUser when getUserId/getAccessToken are unset', async () => {
        const config: DbConfig = {
            db: { authenticatedRoleClaim: 'org_role' },
            resolveAuthUser: async () => ({
                uid: 'firebase-uid',
                getIdToken: async () => 'id-token',
                getIdTokenResult: async () => ({ claims: { org_role: 'editor' } }),
            }),
        };
        const result = await resolveUserDbCredentials(config);
        expect(result).toEqual({ uid: 'firebase-uid', accessToken: 'id-token', role: 'editor' });
    });

    it('returns nulls when resolveAuthUser resolves to null (nobody signed in)', async () => {
        const config: DbConfig = { db: {}, resolveAuthUser: async () => null };
        expect(await resolveUserDbCredentials(config)).toEqual({ uid: null, accessToken: null, role: null });
    });

    it('skips resolveAuthUser entirely when it is unset', async () => {
        const config: DbConfig = { db: { getUserId: () => 'from-config' } };
        const result = await resolveUserDbCredentials(config);
        expect(result.uid).toBe('from-config');
        expect(result.role).toBeNull();
    });

    it('does not read claims when authenticatedRoleClaim is false', async () => {
        const resolveAuthUser = vi.fn(async () => ({
            uid: 'u1',
            getIdToken: async () => 't1',
            getIdTokenResult: vi.fn(async () => ({ claims: { role: 'should-not-be-read' } })),
        }));
        const config: DbConfig = { db: { authenticatedRoleClaim: false }, resolveAuthUser };
        const result = await resolveUserDbCredentials(config);
        expect(result.role).toBeNull();
    });
});
```

(`withUserDb`'s own existing test cases that exercise `resolveUserId`/`resolveAuthenticatedRole` via `config.firebaseAuth` — grep `context.test.ts` for `firebaseAuth` — get their fixtures' `firebaseAuth: {...}` field replaced by an equivalent `resolveAuthUser: async () => ({...})` field, same assertions.)

- [ ] **Step 3: Run to verify the new cases fail**

```bash
cd packages/db && npx vitest run src/context.test.ts
```

Expected: FAIL — `context.ts` not yet moved/rewritten (or, if run against the stale copy, the new `resolveAuthUser`-based fixtures don't match the still-`firebaseAuth`-based implementation).

- [ ] **Step 4: Move `context.ts` and rewrite its three call sites**

```bash
cp packages/cloudflare-next-intl/src/db/context.ts packages/db/src/context.ts
```

Edit the import block — change:
```ts
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { DbRoutingConfig, SupabaseDbConfig } from '../types/types.js';
import requireDbConfig from './require_config.js';
import { withDbClient, type DbConfig } from './connection.js';
import resolveDbConfig from './resolve_db_config.js';
import resolveDbMode from './resolve_mode.js';
import resolveSupabaseEndpoint from './supabase_config.js';
import createSupabaseTransport from './supabase_transport.js';
import resolveAccessToken from './access_token.js';
import runTransactionBatch, { type BatchQuery } from './transaction_batch.js';
import type { ExecResult } from './supabase_transport.js';
import inlineParams from './inline_params.js';
```
to:
```ts
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { DbConfig, DbRoutingConfig, SupabaseDbConfig } from './types.js';
import requireDbConfig from './require_config.js';
import { withDbClient } from './connection.js';
import resolveDbMode from './resolve_mode.js';
import resolveSupabaseEndpoint from './supabase_config.js';
import createSupabaseTransport from './supabase_transport.js';
import resolveAccessToken from './access_token.js';
import runTransactionBatch, { type BatchQuery } from './transaction_batch.js';
import type { ExecResult } from './supabase_transport.js';
import inlineParams from './inline_params.js';
```

(`resolveDbConfig` import dropped — every exported function here now takes `config: DbConfig` directly, never resolves it itself.)

Call site 1 — `resolveUserDbCredentials`. Change:
```ts
    if (config.firebaseAuth && (uid === null || accessToken === null || db.authenticatedRoleClaim !== false)) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user) {
            uid ??= user.uid ?? null;
            accessToken ??= (await user.getIdToken(false)) ?? null;
            if (db.authenticatedRoleClaim !== false && typeof user.getIdTokenResult === 'function') {
                const { claims } = await user.getIdTokenResult();
                const claimValue = claims[db.authenticatedRoleClaim ?? 'role'];
                if (typeof claimValue === 'string' && claimValue) role = claimValue;
            }
        }
    }
```
to:
```ts
    if (config.resolveAuthUser && (uid === null || accessToken === null || db.authenticatedRoleClaim !== false)) {
        const authUser = await config.resolveAuthUser();
        if (authUser) {
            uid ??= authUser.uid ?? null;
            accessToken ??= (await authUser.getIdToken(false)) ?? null;
            if (db.authenticatedRoleClaim !== false) {
                const { claims } = await authUser.getIdTokenResult();
                const claimValue = claims[db.authenticatedRoleClaim ?? 'role'];
                if (typeof claimValue === 'string' && claimValue) role = claimValue;
            }
        }
    }
```

Call site 2 — `resolveUserId`. Change:
```ts
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user?.uid) return user.uid;
    }
```
to:
```ts
    if (config.resolveAuthUser) {
        const authUser = await config.resolveAuthUser();
        if (authUser?.uid) return authUser.uid;
    }
```

Call site 3 — `resolveAuthenticatedRole`. Change:
```ts
async function resolveAuthenticatedRole(config: DbConfig, db: DbRoutingConfig, claimed?: string | null): Promise<string> {
    if (claimed) return claimed;
    const claimField = db.authenticatedRoleClaim;
    if (config.firebaseAuth && claimField !== false && claimed === undefined) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user && typeof user.getIdTokenResult === 'function') {
            const { claims } = await user.getIdTokenResult();
            const claimValue = claims[claimField ?? 'role'];
            if (typeof claimValue === 'string' && claimValue) return claimValue;
        }
    }
```
to:
```ts
async function resolveAuthenticatedRole(config: DbConfig, db: DbRoutingConfig, claimed?: string | null): Promise<string> {
    if (claimed) return claimed;
    const claimField = db.authenticatedRoleClaim;
    if (config.resolveAuthUser && claimField !== false && claimed === undefined) {
        const authUser = await config.resolveAuthUser();
        if (authUser) {
            const { claims } = await authUser.getIdTokenResult();
            const claimValue = claims[claimField ?? 'role'];
            if (typeof claimValue === 'string' && claimValue) return claimValue;
        }
    }
```

Every other function in `context.ts` — `withPublicDb`, `withUserDb`, `supabaseDb`, `postgresDb`, `runPostgresTransaction`, `buildOnlyDb`, `callBuild`, `injectUidComment`, `runTransaction`, `isCredentials`, `throwMissingCredential` — is copied byte-for-byte with **one** mechanical change throughout: every `dbOverride?: DbRoutingConfig` parameter and every internal `resolveDbConfig(dbOverride)` call is replaced by taking the already-resolved `config: DbConfig` directly as a required parameter. Concretely, `withPublicDb`'s signature and first two lines:
```ts
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    const db = config.db;
```
becomes:
```ts
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, config: DbConfig): Promise<T> {
    const db = config.db;
```
and `withUserDb`'s matching lines:
```ts
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, auth?: string | null | UserDbCredentials, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    const db = config.db;
```
becomes:
```ts
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, auth: string | null | UserDbCredentials | undefined, config: DbConfig): Promise<T> {
    const db = config.db;
```
and `resolveUserDbCredentials`'s own signature:
```ts
export async function resolveUserDbCredentials(dbOverride?: DbRoutingConfig): Promise<UserDbCredentials> {
    const config = await resolveDbConfig(dbOverride);
    const db = config.db;
```
becomes:
```ts
export async function resolveUserDbCredentials(config: DbConfig): Promise<UserDbCredentials> {
    const db = config.db;
```

Everything below each of those three lines in every function is unchanged.

- [ ] **Step 5: Update `context.test.ts` call sites for the new required-`config` signatures**

Every existing call in `context.test.ts` of the shape `withPublicDb(fn, { connectionString: '...' })` (passing a bare `DbRoutingConfig` as the old optional `dbOverride`) becomes `withPublicDb(fn, { db: { connectionString: '...' } })` (passing the full `DbConfig`). Grep and update each call site:

```bash
grep -n "withPublicDb(\|withUserDb(\|resolveUserDbCredentials(" packages/db/src/context.test.ts
```

For every match whose second/only config-ish argument is a bare `DbRoutingConfig`-shaped object literal, wrap it as `{ db: <that literal> }`; where a test already builds a `config` object with `db`/`generate`/`errorHandling` fields (testing `withDbClient`'s Cloudflare `ctx.waitUntil` behavior, etc.), no change is needed — it was already `DbConfig`-shaped. Also update any `firebaseAuth: {...}` fixture fields to `resolveAuthUser: async () => ({...})` per Step 2.

Also move `build_only_db.test.ts` unedited (it only exercises `buildOnlyDb`'s "await instead of `.toSQL()`" error, no config/auth involved):

```bash
cp packages/cloudflare-next-intl/src/db/build_only_db.test.ts packages/db/src/build_only_db.test.ts
```

- [ ] **Step 6: Run context tests to verify green**

```bash
cd packages/db && npx vitest run src/context.test.ts src/build_only_db.test.ts
```

Expected: PASS, 100% coverage on `context.ts`.

- [ ] **Step 7: Move `testing.ts` and `helpers.ts` + tests (pure, no changes)**

```bash
cp packages/cloudflare-next-intl/src/db/testing.ts packages/db/src/testing.ts
cp packages/cloudflare-next-intl/src/db/testing.test.ts packages/db/src/testing.test.ts
cp packages/cloudflare-next-intl/src/db/helpers.ts packages/db/src/helpers.ts
cp packages/cloudflare-next-intl/src/db/helpers.test.ts packages/db/src/helpers.test.ts
```

Confirm no cross-boundary imports:

```bash
grep -n "^import" packages/db/src/testing.ts packages/db/src/helpers.ts
```

Expected: `testing.ts` has no cross-file imports; `helpers.ts` only imports from `drizzle-orm` and `drizzle-orm/pg-core` (re-exports query-building primitives and helpers, no local relative imports). Both tests pass directly.

- [ ] **Step 8: Write the barrel `packages/db/src/index.ts`**

```ts
/**
 * Framework-agnostic Postgres/Drizzle/Supabase data-access layer.
 * `cloudflare-next-intl`'s `./db` subpath re-exports this package and layers
 * its own `@intl-config`/Firebase Auth convenience on top (see
 * `packages/cloudflare-next-intl/src/db/index.ts`); call this package directly when you have
 * neither Next.js nor `@intl-config` — a Deno Supabase Edge Function, a
 * plain Node script, a Firebase Function.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * `pg`, `drizzle-orm`, and `@supabase/supabase-js` all load through dynamic
 * `import()` inside these functions, so an app that never calls a `db`
 * export never bundles any of them.
 */
export { withPublicDb, withUserDb, resolveUserDbCredentials } from './context.js';
export type { UserDbCredentials, DrizzleDb, TransactionResult } from './context.js';
export { withDbClient, connectToPostgres, disconnectPostgres, resetConnectionState, withSessionLock } from './connection.js';
export type {
    DbConfig,
    DbRoutingConfig,
    SupabaseDbConfig,
    GenerateRoutingConfig,
    ErrorHandlingRoutingConfig,
    ErrorHandlingParams,
    AuthUserResolverResult,
    ConfigValue,
    FallibleConfigValue,
} from './types.js';
```

Delete the Task 1 stub content (`export * from './schema.js';`) — `schema` moves to its own `./schema` subpath (already declared in `package.json#exports` since Task 1), not the root barrel (matches the main package's own convention: `db.md`'s "Helper subpaths" are separate from the root `./db` barrel).

- [ ] **Step 9: Move `index.test.ts`, adapt for the new barrel**

```bash
cp packages/cloudflare-next-intl/src/db/index.test.ts packages/db/src/index.test.ts
```

The main package's `src/db/index.test.ts` (462 bytes — likely just asserts the barrel exports the expected named exports) needs its expected-exports list updated to match the barrel above (drop nothing, the export names are identical — only the import path inside the test file, `from './index.js'`, needs no change since it already resolves within `packages/db`).

- [ ] **Step 10: Full build + test + publish checks**

```bash
cd packages/db && npm run build && npm test && npm run check:exports && npm run check:size
```

Expected: all green, 100% coverage overall.

- [ ] **Step 11: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): rewrite context.ts around resolveAuthUser, add testing.ts and barrel index.ts"
```

---

### Task 8: Move `codegen_paths.ts`, `install_exec.ts`, the 5 `bin/` scripts, and `supabase/*.sql`

**Files:**
- Create: `packages/db/src/codegen_paths.ts` (moved, import path only), `packages/db/src/install_exec.ts` (moved, unchanged — pure `node:fs`/`node:path`)
- Test: matching `.test.ts`, moved
- Create: `packages/db/bin/db_codegen.mjs`, `db_install_exec.mjs`, `ddl_order.mjs`, `ephemeral_pg.mjs`, `install_exec_step.mjs` (moved from `packages/cloudflare-next-intl/bin/`)
- Create: `packages/db/supabase/cfni_exec.sql`, `packages/db/supabase/tests/cfni_exec.sql` (moved from `packages/cloudflare-next-intl/supabase/`)
- Test: `packages/db/src/cfni_exec.integration.test.ts`, `packages/db/src/db_performance.bench.ts` (moved)

**Interfaces:**
- Produces: `installExecFile`, `InstallExecFile`, `InstallExecOutcome` (`install_exec.ts`) and codegen path-resolution helpers (`codegen_paths.ts`) — consumed by the moved `bin/db_codegen.mjs`/`bin/db_install_exec.mjs`.

- [ ] **Step 1: Move `codegen_paths.ts` + test**

```bash
cp packages/cloudflare-next-intl/src/db/codegen_paths.ts packages/db/src/codegen_paths.ts
cp packages/cloudflare-next-intl/src/db/codegen_paths.test.ts packages/db/src/codegen_paths.test.ts
```

Check and fix its types import the same way as Task 6:
```bash
grep -n "from '\.\./types/types.js'" packages/db/src/codegen_paths.ts
```
If present, replace `'../types/types.js'` with `'./types.js'`.

- [ ] **Step 2: Move `install_exec.ts` + test (unchanged — confirmed pure, `node:fs`/`node:path` only)**

```bash
cp packages/cloudflare-next-intl/src/db/install_exec.ts packages/db/src/install_exec.ts
cp packages/cloudflare-next-intl/src/db/install_exec.test.ts packages/db/src/install_exec.test.ts
```

- [ ] **Step 3: Move the 5 `bin/` scripts**

```bash
mkdir -p packages/db/bin
for f in db_codegen db_install_exec ddl_order ephemeral_pg install_exec_step; do
  cp "packages/cloudflare-next-intl/bin/$f.mjs" "packages/db/bin/$f.mjs"
done
```

Each script's internal `import`s of sibling `dist/src/db/*.js` files (e.g. `bin/db_codegen.mjs` importing the built `codegen_paths.js`/`install_exec.js`) already resolve relative to the package root — since `packages/db/dist/src/*.js` mirrors `packages/cloudflare-next-intl/dist/src/db/*.js`'s old shape one directory shallower (no `db/` segment), grep each moved script for its relative import depth and fix:

```bash
grep -n "require(\|import(\|from '\.\./" packages/db/bin/*.mjs
```

For every reference of the form `../dist/src/db/<name>.js`, change to `../dist/src/<name>.js` (one fewer `db/` path segment, since `packages/db/src/*.ts` has no `db/` subfolder the way `packages/cloudflare-next-intl/src/db/*.ts` did). For every reference to `../supabase/cfni_exec.sql` or `../supabase/tests/cfni_exec.sql`, no change needed — that relative path is unchanged (`packages/db/supabase/...` sits at the same relative position to `packages/db/bin/...` as `packages/cloudflare-next-intl/supabase/...` did to `packages/cloudflare-next-intl/bin/...`).

- [ ] **Step 4: Move `supabase/*.sql`**

```bash
mkdir -p packages/db/supabase/tests
cp packages/cloudflare-next-intl/supabase/cfni_exec.sql packages/db/supabase/cfni_exec.sql
cp packages/cloudflare-next-intl/supabase/tests/cfni_exec.sql packages/db/supabase/tests/cfni_exec.sql
```

- [ ] **Step 5: Move `cfni_exec.integration.test.ts` and `db_performance.bench.ts`**

```bash
cp packages/cloudflare-next-intl/src/db/cfni_exec.integration.test.ts packages/db/src/cfni_exec.integration.test.ts
cp packages/cloudflare-next-intl/src/db/db_performance.bench.ts packages/db/src/db_performance.bench.ts
```

Fix any `../types/types.js`/`../bin/`/`../supabase/` path references the same way as prior steps (grep first, edit only real matches).

- [ ] **Step 6: Build and run the full test + bench + integration suite**

```bash
cd packages/db && npm run build && npm test
node bin/db_codegen.mjs --help
node bin/db_install_exec.mjs --help
```

Expected: `npm test` green at 100% coverage; both bin scripts print usage without crashing on a missing-arg path (confirms their internal relative imports resolve correctly post-move — this is the real regression risk in this task, since it's the one place a wrong relative path fails silently at require-time rather than at `tsc` build-time).

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): move codegen/install-exec, bin scripts, and cfni_exec.sql"
```

---

### Task 9: Move `eslint_config.ts` (dbEslint), update its restricted-import pattern

**Files:**
- Create: `packages/db/src/eslint_config.ts` (moved, one string updated)
- Test: `packages/db/src/eslint_config.test.ts` (moved, assertion updated)

**Interfaces:**
- Produces: default export `dbEslintConfig` (an ESLint flat-config array) at `@cloudflare-next-intl/db/eslint`.

- [ ] **Step 1: Write the failing test for the updated pattern**

Edit the moved `packages/db/src/eslint_config.test.ts`'s existing assertion that checks the `patterns` array (currently expecting `'cloudflare-next-intl/dist/*'`) to expect `'@cloudflare-next-intl/db/dist/*'` instead — find the relevant `expect(...)` line via:

```bash
grep -n "cloudflare-next-intl/dist" packages/cloudflare-next-intl/src/db/eslint_config.test.ts
```

and change that literal string in the copied test to `'@cloudflare-next-intl/db/dist/*'`.

- [ ] **Step 2: Run it to verify it fails**

```bash
cp packages/cloudflare-next-intl/src/db/eslint_config.ts packages/db/src/eslint_config.ts
cp packages/cloudflare-next-intl/src/db/eslint_config.test.ts packages/db/src/eslint_config.test.ts
# (apply the Step 1 edit to the copied test before running)
cd packages/db && npx vitest run src/eslint_config.test.ts
```

Expected: FAIL — `packages/db/src/eslint_config.ts` still has the old pattern string.

- [ ] **Step 3: Update `packages/db/src/eslint_config.ts`**

Change:
```ts
                    patterns: ['cloudflare-next-intl/dist/*'],
```
to:
```ts
                    patterns: ['cloudflare-next-intl/dist/*', '@cloudflare-next-intl/db/dist/*'],
```

(Keeping the old pattern too — a project that still imports the main package's `./db` re-export and reaches into its `dist/` directly should still be caught; the new pattern catches the same mistake against the new package directly.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/db && npx vitest run src/eslint_config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build full package**

```bash
cd packages/db && npm run build && npm test && npm run check:exports && npm run check:size
```

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(packages/db): move eslint_config.ts, restrict both package's dist paths"
```

---

### Task 10: Finalize `packages/db`'s exports map, README, llms.txt; add CI workflows

**Files:**
- Modify: `packages/db/package.json` (`exports` map)
- Modify: `packages/db/README.md`, `packages/db/llms.txt`
- Create: `.github/workflows/packages/db-test-coverage.yaml`, `.github/workflows/packages/db-push-code-coverage.yaml`, `.github/workflows/packages/db-publish.yaml`

**Interfaces:**
- Produces: final `packages/db/package.json#exports` map — `.`, `./helpers`, `./schema`, `./testing`, `./eslint`, plus every `bin` entry already declared in Task 1.

- [ ] **Step 1: Confirm the exports map already matches what was built**

Task 1 already declared `.`, `./helpers`, `./schema`, `./testing`, `./eslint` — no new subpaths were added in Tasks 2–9 (everything else moved is either an internal implementation file reached only via those five subpaths' barrels, or a `bin/` CLI script). Verify:

```bash
cd packages/db && npm run check:exports
```

Expected: `OK: 5/5 export targets import cleanly` (no skips — this package has no `@intl-config`).

- [ ] **Step 2: Expand `README.md` and `llms.txt` with real usage**

Append to `packages/db/README.md` (after the existing "Subpaths" section from Task 1):

```markdown
## Usage outside Next.js — e.g. a Deno Supabase Edge Function

\`\`\`ts
import { withPublicDb } from "npm:@cloudflare-next-intl/db";

const rows = await withPublicDb(
  (db) => db.select().from(articles),
  { db: { supabase: { url: Deno.env.get("SUPABASE_URL"), anonKey: Deno.env.get("SUPABASE_ANON_KEY") } } },
);
\`\`\`

No `resolveAuthUser` is needed for `withPublicDb`. For `withUserDb`, pass a
`resolveAuthUser` callback backed by whatever your own auth system already
gives you — e.g. decode the caller's own JWT and return `{ uid, getIdToken,
getIdTokenResult }` — or pass an explicit `UserDbCredentials` as `withUserDb`'s
second argument instead and skip `resolveAuthUser` entirely.
```

Append the same example (without the markdown fencing) to `packages/db/llms.txt`.

- [ ] **Step 3: Add the three GitHub Actions workflow files**

`.github/workflows/packages/db-test-coverage.yaml`:

```yaml
name: DB Package CI - Build and Test

on:
  workflow_dispatch:
  pull_request:
    paths:
      - "packages/db/**"
    branches: [main]

concurrency:
  group: packages/db-ci-$
  cancel-in-progress: true

jobs:
  build_tests:
    uses: demian-ilnytskyi/workflows/.github/workflows/package_ci_build_and_test.yml@main
    secrets: inherit
    with:
      project_type: node
      working_directory: packages/db
      test_path: src
      min_coverage: 100
      min_overall_coverage: 100
      run_bench: true
```

`.github/workflows/packages/db-push-code-coverage.yaml`:

```yaml
name: DB Package Push Code Coverage

on:
  workflow_dispatch:
  push:
    paths:
      - "packages/db/**"
    branches:
      - main

concurrency:
  group: packages/db-generate-code-coverage
  cancel-in-progress: true

jobs:
  push_code_coverage:
    uses: demian-ilnytskyi/workflows/.github/workflows/package_push_code_coverage.yml@main
    secrets: inherit
    with:
      project_type: node
      working_directory: packages/db
      test_path: src
      min_coverage: 100
      min_overall_coverage: 100
```

`.github/workflows/packages/db-publish.yaml`:

```yaml
name: DB Package CD - Publish

on:
  workflow_dispatch:

concurrency:
  group: packages/db-cd-publish
  cancel-in-progress: false

jobs:
  publish:
    uses: demian-ilnytskyi/workflows/.github/workflows/package_publish.yml@main
    secrets: inherit
    with:
      working_directory: packages/db
```

`project_type: node` (not `nextjs`, the value the main package's workflows use) — confirm with whoever owns `demian-ilnytskyi/workflows` that `package_ci_build_and_test.yml`/`package_push_code_coverage.yml` support a plain-Node `project_type` before merging; if only `nextjs` is currently supported, this step blocks on a small change to that shared workflow repo first (out of scope for this plan — flag it, don't silently reuse `nextjs` for a package with no Next.js in it).

- [ ] **Step 4: Commit**

```bash
git add packages/db .github/workflows
git commit -m "docs(packages/db): finalize README/llms.txt, add CI workflows"
```

---

### Task 11: `packages/cloudflare-next-intl/` — depend on `@cloudflare-next-intl/db`, rewrite the wrapper layer

This is the task that must not break anything. `packages/cloudflare-next-intl/src/db/index.ts`'s export list and every function's public signature stay byte-identical to today.

**Files:**
- Modify: `packages/cloudflare-next-intl/package.json` (dependency swap)
- Modify: `packages/cloudflare-next-intl/src/types/types.ts` (re-export 3 types from the sub-package)
- Modify: `packages/cloudflare-next-intl/src/db/resolve_db_config.ts` (adds `resolveAuthUser` construction)
- Rewrite: `packages/cloudflare-next-intl/src/db/context.ts` (~446 lines -> ~60 lines)
- Rewrite: `packages/cloudflare-next-intl/src/db/connection.ts` (~186 lines -> re-exports)
- Delete: `packages/cloudflare-next-intl/src/db/access_token.ts` (no longer needed — `packages/db` owns this)
- Rewrite: `packages/cloudflare-next-intl/src/db/helpers.ts`, `schema.ts`, `testing.ts`, `eslint_config.ts` (re-exports)
- Modify: `packages/cloudflare-next-intl/src/db/index.ts` (unchanged export list, new implementation)
- Test: rewrite `packages/cloudflare-next-intl/src/db/context.test.ts`, `resolve_db_config.test.ts`; delete `packages/cloudflare-next-intl/src/db/{connection,access_token,rest_client,rest_execute,rest_filters,resolve_mode,resolve_hyperdrive_connection_string,supabase_config,supabase_transport,transaction_batch,encode_param,inline_params,parse_composite,parse_where,parse_statement,sql_tokens,unsupported_sql,require_config,resolve_config_value,resolve_raw_sql,codegen_paths,install_exec,eslint_config,helpers,schema,testing,cfni_exec.integration,db_performance.bench,index,build_only_db}.test.ts` (all now covered by `packages/db`'s own 100%-covered copies)

**Interfaces:**
- Consumes: `@cloudflare-next-intl/db`'s full barrel + `./helpers`/`./schema`/`./testing`/`./eslint` subpaths (Tasks 1–10).
- Produces (unchanged from today): `withPublicDb<T>(fn, dbOverride?: DbRoutingConfig): Promise<T>`, `withUserDb<T>(fn, auth?, dbOverride?: DbRoutingConfig): Promise<T>`, `resolveUserDbCredentials(dbOverride?: DbRoutingConfig): Promise<UserDbCredentials>`, `withDbClient`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState` — every signature identical to the pre-extraction version; `DbRoutingConfig` re-exported (originally defined) from `types/types.ts`, now itself re-exported from `@cloudflare-next-intl/db`.

- [ ] **Step 1: Add the dependency**

Edit `packages/cloudflare-next-intl/package.json`'s `dependencies` block — remove `@supabase/supabase-js`, `drizzle-kit`, `drizzle-orm`, `embedded-postgres`, `pg` (verified in plan research: every use of these 5 packages inside `packages/cloudflare-next-intl/src/**`/`packages/cloudflare-next-intl/bin/**` was inside `src/db/**` or `bin/db_codegen.mjs`/`bin/db_install_exec.mjs`/`bin/ephemeral_pg.mjs`, all now moved), add:

```json
"@cloudflare-next-intl/db": "file:../db",
```

Resulting `dependencies` block:

```json
"dependencies": {
  "@cloudflare-next-intl/db": "file:../db",
  "@microsoft/clarity": "^1.0.2",
  "jose": "^6.2.8",
  "sharp": "^0.34.5 || ^0.35.0"
},
```

Also remove the now-unused `@types/pg` from `devDependencies` (it was only needed for `pg`'s types, used solely inside the old `src/db/connection.ts`).

- [ ] **Step 2: Update `types/types.ts` to re-export from the sub-package**

Find `DbRoutingConfig`, `SupabaseDbConfig`, `FallibleConfigValue` in `packages/cloudflare-next-intl/src/types/types.ts` (lines ~1022, ~1024, ~1063 per plan research) and replace their local `export interface`/`export type` declarations with:

```ts
export type { DbRoutingConfig, SupabaseDbConfig, FallibleConfigValue } from '@cloudflare-next-intl/db';
```

placed at the same location in the file (keep every doc comment that preceded them — copy those comments up onto this one re-export line, condensed, since TypeDoc/IDE hover for consumers of `cloudflare-next-intl`'s own `DbRoutingConfig` re-export should still show useful docs — or leave the full original doc comments in `packages/db/src/types.ts` from Task 2 as the canonical source and just note here `/** See `@cloudflare-next-intl/db`'s `DbRoutingConfig` for field docs. */` above the re-export line, since duplicating every field doc comment twice is a maintenance trap).

- [ ] **Step 3: Rewrite `packages/cloudflare-next-intl/src/db/resolve_db_config.ts` to also build `resolveAuthUser`**

Current file (unchanged so far):
```ts
import type { DbRoutingConfig } from '../types/types.js';
import type { DbConfig } from './connection.js';

export default async function resolveDbConfig(dbOverride?: DbRoutingConfig): Promise<DbConfig> {
    let base: DbConfig = {};
    try {
        base = (await import('../config/intl_config.js')).default;
    } catch {
        // `@intl-config` alias not set — fine as long as `dbOverride` is given.
    }

    if (!dbOverride) return base;
    return { ...base, db: dbOverride };
}
```

Rewrite to import `DbConfig` from `@cloudflare-next-intl/db` (its `connection.ts` no longer defines it — Task 11 Step 5 below), and to attach `resolveAuthUser` whenever the resolved config has `firebaseAuth` set:

```ts
import type { DbRoutingConfig, DbConfig } from '@cloudflare-next-intl/db';
import type { RoutingConfig } from '../types/types.js';

function buildAuthUserResolver(config: RoutingConfig): DbConfig['resolveAuthUser'] {
    if (!config.firebaseAuth) return undefined;
    return async () => {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (!user) return null;
        return {
            uid: user.uid ?? null,
            getIdToken: (forceRefresh) => user.getIdToken(forceRefresh),
            getIdTokenResult: () => user.getIdTokenResult(),
        };
    };
}

export default async function resolveDbConfig(dbOverride?: DbRoutingConfig): Promise<DbConfig> {
    let base: RoutingConfig = {};
    try {
        base = (await import('../config/intl_config.js')).default;
    } catch {
        // `@intl-config` alias not set — fine as long as `dbOverride` is given.
    }

    const db = dbOverride ?? base.db;
    return {
        db,
        generate: base.generate,
        errorHandling: base.errorHandling,
        resolveAuthUser: buildAuthUserResolver(base),
    };
}
```

(`RoutingConfig` here is the main package's existing full top-level config type from `types/types.ts` — not shown in full in plan research but referenced throughout the codebase as the shape `@intl-config`'s default export satisfies; verify its exact export name via `grep -n "^export interface RoutingConfig" packages/cloudflare-next-intl/src/types/types.ts` before writing this import, in case it's named differently.)

- [ ] **Step 4: Update `resolve_db_config.test.ts`**

Add a case asserting `resolveAuthUser` is set when `@intl-config`'s mock (`src/test_utils/mock_intl_config.ts`, aliased in `vitest.config.ts`) has `firebaseAuth` configured, and unset when it doesn't — mirroring the existing test's structure (it already mocks `@intl-config` per `vitest.config.ts`'s alias). Keep every existing assertion (dbOverride wins over `@intl-config`, empty base when the alias throws) unchanged.

- [ ] **Step 5: Rewrite `packages/cloudflare-next-intl/src/db/connection.ts` as pure re-exports**

Replace the entire file:

```ts
export {
    withDbClient,
    connectToPostgres,
    disconnectPostgres,
    resetConnectionState,
    withSessionLock,
} from '@cloudflare-next-intl/db';
export type { DbConfig } from '@cloudflare-next-intl/db';
```

Delete `packages/cloudflare-next-intl/src/db/connection.test.ts` (0% new logic to cover — a re-export file has no branches; add it to `vitest.config.ts`'s coverage `exclude`, same treatment as any other barrel file in this codebase per `structure.md`: "barrels are excluded from coverage").

- [ ] **Step 6: Delete `packages/cloudflare-next-intl/src/db/access_token.ts` and its test**

```bash
rm packages/cloudflare-next-intl/src/db/access_token.ts packages/cloudflare-next-intl/src/db/access_token.test.ts
```

- [ ] **Step 7: Rewrite `packages/cloudflare-next-intl/src/db/context.ts`**

Replace the entire 446-line file with a thin wrapper around `resolveDbConfig`:

```ts
import type { DbRoutingConfig, DrizzleDb, TransactionResult, UserDbCredentials } from '@cloudflare-next-intl/db';
import {
    withPublicDb as withPublicDbImpl,
    withUserDb as withUserDbImpl,
    resolveUserDbCredentials as resolveUserDbCredentialsImpl,
} from '@cloudflare-next-intl/db';
import resolveDbConfig from './resolve_db_config.js';

export type { DrizzleDb, TransactionResult, UserDbCredentials };

/**
 * Runs a query as the anonymous role. See `@cloudflare-next-intl/db`'s
 * `withPublicDb` for the full transaction/transport contract — this wrapper
 * only adds `@intl-config` auto-resolution and Firebase Auth wiring on top.
 *
 * @param dbOverride A `db` block to use instead of `@intl-config`'s — the
 * only thing a standalone (non-Next.js) caller of THIS package needs to
 * pass. Call `@cloudflare-next-intl/db` directly instead if you have no
 * `@intl-config` at all.
 */
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    return withPublicDbImpl(fn, config);
}

/** Runs a query as the signed-in user. See `withPublicDb`'s doc comment for the `dbOverride` contract. */
export async function withUserDb<T>(
    fn: (db: DrizzleDb) => Promise<T>,
    auth?: string | null | UserDbCredentials,
    dbOverride?: DbRoutingConfig,
): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    return withUserDbImpl(fn, auth, config);
}

/** Resolves the caller's id/token/role — see `@cloudflare-next-intl/db`'s `resolveUserDbCredentials`. */
export async function resolveUserDbCredentials(dbOverride?: DbRoutingConfig): Promise<UserDbCredentials> {
    const config = await resolveDbConfig(dbOverride);
    return resolveUserDbCredentialsImpl(config);
}
```

- [ ] **Step 8: Rewrite `packages/cloudflare-next-intl/src/db/context.test.ts`**

Replace its ~42KB of transaction/session/proxy test coverage (now living in `packages/db/src/context.test.ts`, already 100%-covered there) with a small, focused suite proving the wrapper delegates correctly:

```ts
import { describe, it, expect, vi } from 'vitest';

const withPublicDbImpl = vi.fn(async (fn: (db: unknown) => unknown) => fn({}));
const withUserDbImpl = vi.fn(async (fn: (db: unknown) => unknown) => fn({}));
const resolveUserDbCredentialsImpl = vi.fn(async () => ({ uid: 'u1', accessToken: 't1', role: 'authenticated' }));

vi.mock('@cloudflare-next-intl/db', () => ({
    withPublicDb: withPublicDbImpl,
    withUserDb: withUserDbImpl,
    resolveUserDbCredentials: resolveUserDbCredentialsImpl,
}));

const resolveDbConfigMock = vi.fn(async () => ({ db: { connectionString: 'postgres://resolved' } }));
vi.mock('./resolve_db_config.js', () => ({ default: resolveDbConfigMock }));

const { withPublicDb, withUserDb, resolveUserDbCredentials } = await import('./context.js');

describe('context.ts wrapper', () => {
    it('withPublicDb resolves config via resolve_db_config then delegates to @cloudflare-next-intl/db', async () => {
        const fn = vi.fn(async () => 'result');
        const result = await withPublicDb(fn, { connectionString: 'override' });

        expect(resolveDbConfigMock).toHaveBeenCalledWith({ connectionString: 'override' });
        expect(withPublicDbImpl).toHaveBeenCalledWith(fn, { db: { connectionString: 'postgres://resolved' } });
        expect(result).toBe('result');
    });

    it('withUserDb resolves config and forwards auth', async () => {
        const fn = vi.fn(async () => 'result');
        await withUserDb(fn, 'explicit-uid', undefined);

        expect(resolveDbConfigMock).toHaveBeenCalledWith(undefined);
        expect(withUserDbImpl).toHaveBeenCalledWith(fn, 'explicit-uid', { db: { connectionString: 'postgres://resolved' } });
    });

    it('resolveUserDbCredentials resolves config and delegates', async () => {
        const result = await resolveUserDbCredentials();

        expect(resolveUserDbCredentialsImpl).toHaveBeenCalledWith({ db: { connectionString: 'postgres://resolved' } });
        expect(result).toEqual({ uid: 'u1', accessToken: 't1', role: 'authenticated' });
    });
});
```

- [ ] **Step 9: Rewrite `helpers.ts`, `schema.ts`, `testing.ts`, `eslint_config.ts` as re-exports**

```bash
cat > packages/cloudflare-next-intl/src/db/helpers.ts <<'EOF'
export * from '@cloudflare-next-intl/db/helpers';
EOF
cat > packages/cloudflare-next-intl/src/db/schema.ts <<'EOF'
export * from '@cloudflare-next-intl/db/schema';
EOF
cat > packages/cloudflare-next-intl/src/db/testing.ts <<'EOF'
export * from '@cloudflare-next-intl/db/testing';
EOF
cat > packages/cloudflare-next-intl/src/db/eslint_config.ts <<'EOF'
export { default } from '@cloudflare-next-intl/db/eslint';
EOF
```

Delete their old `.test.ts` files (100%-covered already inside `packages/db`) and add all four to `packages/cloudflare-next-intl/vitest.config.ts`'s coverage `exclude` list as barrel/re-export files.

- [ ] **Step 10: Update `packages/cloudflare-next-intl/src/db/index.ts`**

The barrel's export list is unchanged — only its own doc comment's "load through dynamic `import()`" note needs one clause added, since that's now literally true one level removed (via `@cloudflare-next-intl/db`, not directly). Minimal edit: no code change to the `export { ... } from './context.js'` / `export { ... } from './connection.js'` lines at all (they already point at the right local files, which now re-export from the sub-package) — only append one sentence to the top doc comment:

```ts
 * Implemented on top of `@cloudflare-next-intl/db` — this package layers
 * `@intl-config` auto-resolution and Firebase Auth wiring over that
 * package's framework-agnostic primitives. Call `@cloudflare-next-intl/db`
 * directly if you have neither Next.js nor `@intl-config`.
 *
```
inserted right after the file's existing opening doc-comment paragraph.

- [ ] **Step 11: Delete the now-redundant test files, update `index.test.ts`**

```bash
cd packages/cloudflare-next-intl/src/db
rm -f rest_client.test.ts rest_execute.test.ts rest_filters.test.ts resolve_mode.test.ts \
      resolve_hyperdrive_connection_string.test.ts supabase_config.test.ts supabase_transport.test.ts \
      transaction_batch.test.ts encode_param.test.ts inline_params.test.ts parse_composite.test.ts \
      parse_where.test.ts parse_statement.test.ts sql_tokens.test.ts unsupported_sql.test.ts \
      require_config.test.ts resolve_config_value.test.ts resolve_raw_sql.test.ts codegen_paths.test.ts \
      install_exec.test.ts cfni_exec.integration.test.ts db_performance.bench.ts build_only_db.test.ts
rm -f rest_client.ts rest_execute.ts rest_filters.ts resolve_mode.ts resolve_hyperdrive_connection_string.ts \
      supabase_config.ts supabase_transport.ts transaction_batch.ts encode_param.ts inline_params.ts \
      parse_composite.ts parse_where.ts parse_statement.ts sql_tokens.ts unsupported_sql.ts \
      require_config.ts resolve_config_value.ts resolve_raw_sql.ts codegen_paths.ts install_exec.ts
cd -
```

`packages/cloudflare-next-intl/src/db/index.test.ts` — its existing "does not accidentally export X" style assertions (matching `src/index.test.ts`'s pattern seen in plan research) need no change: it tests what `db/index.ts` exports, and that list is unchanged.

- [ ] **Step 12: Move `packages/cloudflare-next-intl/bin/db_codegen.mjs` and `db_install_exec.mjs` to re-exec shims**

Replace `packages/cloudflare-next-intl/bin/db_codegen.mjs`:

```js
#!/usr/bin/env node
// Re-exec shim: `cfni-db-codegen` now lives in @cloudflare-next-intl/db,
// installed as this package's dependency. Kept here so existing consumers'
// `npx cfni-db-codegen` invocations keep working with no changes needed.
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const target = fileURLToPath(new URL(require.resolve('@cloudflare-next-intl/db/package.json'), import.meta.url));
await import(new URL('../bin/db_codegen.mjs', target).href);
```

Replace `packages/cloudflare-next-intl/bin/db_install_exec.mjs` with the same shim pattern, importing `../bin/db_install_exec.mjs` relative to `@cloudflare-next-intl/db/package.json` instead.

- [ ] **Step 13: Install, build, test everything**

```bash
cd package && npm install && npm run build && npm test
```

Expected: green. Coverage config note — `packages/cloudflare-next-intl/vitest.config.ts`'s per-file exception list (the one baked into `.github/workflows/package-test-coverage.yaml`'s `per_file_exceptions`) needs no new entries; every remaining file in `src/db/**` is either a re-export barrel (excluded from coverage, Step 5/9) or the new `context.ts`/`resolve_db_config.ts` (both fully covered by Steps 4/8's new tests).

- [ ] **Step 14: Run the full package-level checks**

```bash
npm run check:exports
npm run check:size
```

Expected: `check:exports` still `OK: <N>/<N>` with the `@intl-config` skip line present (unchanged — this package still has `@intl-config`). `check:size` reports fewer `dependencies` than before (5 vs. the original 8: `@microsoft/clarity`, `jose`, `sharp`, plus the 4 `@firebase/*` scoped peer... wait peer deps aren't counted by this script — just confirms `pg`/`drizzle-orm`/`drizzle-kit`/`embedded-postgres`/`@supabase/supabase-js` no longer appear, and `@cloudflare-next-intl/db` is not itself banned).

- [ ] **Step 15: Commit**

```bash
git add package
git commit -m "refactor(db): delegate cloudflare-next-intl's db module to @cloudflare-next-intl/db"
```

---

### Task 12: Verify the `example/` app and the public API surface end to end

**Files:**
- Modify: none expected (verification-only task) — if `example/` imports anything from `cloudflare-next-intl/db`, confirm it still resolves; if it doesn't, this task adds a minimal smoke usage.

- [ ] **Step 1: Reinstall and build the example app against both local packages**

```bash
cd example && rm -rf node_modules && npm install && npm run build
```

Expected: succeeds — `example/package.json`'s `"cloudflare-next-intl": "file:./package"` resolves `packages/cloudflare-next-intl/`'s own `"@cloudflare-next-intl/db": "file:../packages/db"` transitively; npm's nested `file:` resolution handles this without workspaces (confirms the plan's "no workspaces needed" architectural choice actually works end to end, not just in theory).

- [ ] **Step 2: If `example/` has no existing db usage, add a minimal smoke import**

```bash
grep -rl "cloudflare-next-intl/db" example/src 2>/dev/null
```

If empty, add one file `example/src/app/api/db-smoke/route.ts`:

```ts
import { withPublicDb } from 'cloudflare-next-intl/db';

export async function GET() {
    try {
        await withPublicDb(async () => 'ok', { connectionString: 'postgres://smoke-test-no-real-connection' });
    } catch (error) {
        // Expected — no real Postgres reachable in this smoke check. The
        // point is that the import resolves and the function is callable,
        // not that the connection succeeds.
        return Response.json({ resolvedButFailedAsExpected: error instanceof Error ? error.message : String(error) });
    }
    return Response.json({ unexpectedlySucceeded: true });
}
```

- [ ] **Step 3: Rebuild and confirm the route compiles**

```bash
cd example && npm run build
```

Expected: build succeeds, confirming `cloudflare-next-intl/db`'s public import path still resolves through the new delegation chain in a real Next.js build (not just under `tsc`/Vitest).

- [ ] **Step 4: Deno import smoke test for the new package (manual — cannot fully verify pre-publish)**

```bash
cd packages/db && npm pack --dry-run 2>&1 | tail -5
```

Note in the commit message / PR description that a real `npm:@cloudflare-next-intl/db` Deno import smoke test (`deno run --allow-net --allow-env` importing `withPublicDb`, confirming no `react`/`next`/`@firebase/*` appear in the resolved `node_modules`) must be run once this package is actually published — it cannot be verified against an unpublished `file:` dependency the same way the earlier local `npm:cloudflare-next-intl@0.9.62/db` spike was (that ran against the real published registry tarball). Track this as a follow-up manual step post-publish, not a task here.

- [ ] **Step 5: Commit**

```bash
git add example
git commit -m "test(example): add db smoke route to prove cloudflare-next-intl/db still resolves end to end"
```

---

## Self-Review

**Spec coverage:** Every constraint from the Global Constraints section has a concrete task: public-API stability (Tasks 7 Step 4 signature note, Task 11 throughout), no dependency-placement gaming (Task 11 Step 1's removal is justified by code motion, not reclassification, per the constraint's own carve-out), README/llms.txt required (Task 1 Steps 2/6, Task 10 Step 2), 100% coverage (every task's build+test step), `check:exports`/`check:size` parity (Tasks 1, 10, 11). The user's three explicit asks are each addressed: `user_id varchar(128)` FK to `profiles` with auto-create — **out of scope for this plan** (that was Task 3850's Scout School work, unrelated to this packages/db extraction; not touched here). `current_user_id()` / RLS / security-invoker / edge-function-only access — also Task 3850, unrelated. The actual ask this plan answers is narrower and later: "add `@cloudflare-next-intl/db` for db only, original package reuses it."

**Placeholder scan:** No "TBD"/"handle appropriately"/unshown code. The one open item (Task 10 Step 3's `project_type: node` support in the shared reusable workflow) is flagged explicitly as a real, named blocking dependency on another repo — not a hidden placeholder.

**Type consistency:** `DbConfig`/`DbRoutingConfig`/`SupabaseDbConfig`/`AuthUserResolverResult`/`GenerateRoutingConfig`/`ErrorHandlingRoutingConfig`/`ErrorHandlingParams` are defined once in `packages/db/src/types.ts` (Task 2) and consumed by name identically through every later task (`connection.ts`, `access_token.ts`, `context.ts`, `resolve_mode.ts`, `rest_client.ts`, `report_error.ts`) — verified against each file's actual current import list from repo inspection, not assumed. `resolveAuthUser`'s shape (`uid`, `getIdToken(forceRefresh?)`, `getIdTokenResult()`) is used identically at all 4 of its call sites (`access_token.ts`, and `context.ts`'s three: `resolveUserDbCredentials`, `resolveUserId`, `resolveAuthenticatedRole`).
