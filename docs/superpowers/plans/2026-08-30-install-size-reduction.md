# Install Size Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the `node_modules` weight `cloudflare-next-intl` forces on consumers from 398 MB to ~125 MB without moving any dependency out of `dependencies` and without removing `README.md` or `llms.txt` from the tarball.

**Architecture:** Three independent dependency-level changes, each verifiable on its own. (1) Delete `@supabase/supabase-js`, which is declared but never imported. (2) Replace the `firebase` umbrella package with the four scoped `@firebase/*` entry points the code actually uses — every Firebase import is already `import type` or dynamic `import()`, so this is a specifier rename plus a `package.json` edit. (3) Replace the 144 MB `embedded-postgres` native Postgres build with the 26 MB PGlite WASM Postgres behind the same TCP wire-protocol contract — a spike-first task that is abandoned, not forced, if `drizzle-kit pull` cannot drive it.

**Tech Stack:** TypeScript 5.5, Node ESM, Vitest 3 (jsdom, v8 coverage, 100% per-file thresholds), `tsc` build to committed `dist/`, npm.

**Spec:** `docs/superpowers/specs/2026-08-30-install-size-reduction.md`

## Global Constraints

Copied verbatim from `.agent/.sub-rules/packages/package-authoring.md`. These override any instinct this plan might trigger:

- **Never move a package out of `dependencies`** (e.g. to `peerDependencies`, `devDependencies`, or `optionalDependencies`) **as a size-optimization move — dependency placement is fixed; optimize elsewhere (tarball contents, dead code, duplicate build output).**
- **Never remove `README.md` or `llms.txt` from the `files` field or the published tarball to reduce package size — both must always ship.**
- `"sideEffects": false` stays at the package root.
- Every subpath entry in `exports` needs both `types` and `import` pointing at built `dist/` output — never at `src/`.
- Heavy optional-module deps are mocked at the module boundary in tests (`vi.mock('firebase/app', ...)`) — never instantiate a real client or make real network calls.
- Coverage thresholds: 100% per-file via `thresholds.perFile` in `package/vitest.config.ts`, with named commented exceptions only. Never add `v8 ignore` pragmas to production source to force a number up.
- `package/dist` is **committed to git** — run `git status` after any build and commit `dist/` changes alongside source changes.
- All work happens inside `package/`. Run every command from `/Volumes/External/own_projects/cloudflare-next-intl/package`.

**Measurement command** used throughout this plan (produces the numbers in the acceptance criteria):

```bash
# from a scratch dir, NOT the repo
rm -rf /tmp/cfni-size && mkdir -p /tmp/cfni-size && cd /tmp/cfni-size
npm init -y >/dev/null
# install exactly the `dependencies` block of package/package.json, then:
npm i --omit=dev --ignore-scripts <each dep@range>
du -sh node_modules
```

---

### Task 1: Remove the never-imported `@supabase/supabase-js` dependency

`@supabase/supabase-js` is 8.6 MB of `dependencies` weight that no file imports. `src/db/rest_client.ts:14` documents this on purpose: the PostgREST client shape is declared *structurally* so "nothing here imports `@supabase/supabase-js`". This is dead-code removal, explicitly permitted by the constraint above — it is not a placement move.

**Files:**
- Modify: `package/package.json` (the `dependencies` block)
- Test: `package/src/db/rest_client.test.ts` (new test added to the existing file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on. `dependencies` no longer contains `@supabase/supabase-js`.

- [ ] **Step 1: Prove the dependency is unreachable before touching anything**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
grep -rnE "(from|import\(|require\()\s*['\"]@supabase" src bin scripts
```

Expected: every hit is inside a comment or a JSDoc block (`rest_client.ts` lines 5, 13, 14, 29 and `index.test.ts:6`). **Zero** hits are a real `import`/`require` statement. If you find a real import, STOP — the spec's premise is wrong and this task must not proceed.

- [ ] **Step 2: Write the failing test that locks this in**

Append to `package/src/db/rest_client.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');

describe('rest_client dependency isolation', () => {
    it('does not declare @supabase/supabase-js as a dependency, because nothing imports it', () => {
        const pkg = JSON.parse(
            readFileSync(resolve(here, '../../package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string> };
        expect(pkg.dependencies?.['@supabase/supabase-js']).toBeUndefined();
    });
});
```

If `package/src/db/rest_client.test.ts` does not exist, create it with `import { describe, it, expect } from 'vitest';` at the top followed by the block above.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/db/rest_client.test.ts -t 'does not declare'`
Expected: FAIL — `expected "^2.112.3" to be undefined`

- [ ] **Step 4: Delete the dependency**

Remove this single line from the `dependencies` block of `package/package.json`:

```json
    "@supabase/supabase-js": "^2.112.3",
```

Then refresh the lockfile:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm install
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/db/rest_client.test.ts -t 'does not declare'`
Expected: PASS

- [ ] **Step 6: Verify nothing else broke**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm test
npm run build && npm run check:exports
```

Expected: all tests pass, coverage thresholds hold, `check_exports.mjs` prints no failures and exits 0.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl
git add package/package.json package/package-lock.json package/src/db/rest_client.test.ts package/dist
git commit -m "perf: drop unused @supabase/supabase-js dependency (-8.6MB install)"
```

---

### Task 2: Replace the `firebase` umbrella with the four scoped `@firebase/*` packages

The umbrella `firebase` package is 156 MB installed (`firebase` 45 MB + `@firebase/*` 111 MB), and it drags in `@firebase/firestore` (63 MB), `@firebase/database`, `@firebase/ai`, `@firebase/storage`, `@firebase/data-connect`, `@firebase/messaging`, every `-compat` shim, `@grpc/*` (3.8 MB) and `@types/node` (2.6 MB). This package uses four entry points: `firebase/app`, `firebase/auth`, `firebase/app-check`, `firebase/performance`. Installing those four scoped packages directly measures **23 MB**.

This is a lighter-equivalent swap inside `dependencies` — nothing is relocated to peer/dev/optional deps. `firebase/auth` is a thin re-export of `@firebase/auth`, so the value and type surface is identical; this was verified empirically (`getAuth`, `signInWithEmailAndPassword`, `onAuthStateChanged`, `onIdTokenChanged`, `GoogleAuthProvider`, `signInWithPopup`, `browserLocalPersistence`, `connectAuthEmulator` all present).

Every existing Firebase import is already `import type` (13 sites) or dynamic `import()` (6 sites). No static value import exists, so tree-shaking behaviour and the `firebase_auth` module's isolation guarantees are unchanged.

**Files:**
- Modify: `package/package.json` (`dependencies`)
- Modify: `package/src/firebase_auth/client/firebase_client.ts` (lines 3–7 type imports; lines 189, 221–223, 270 dynamic imports)
- Modify: `package/src/firebase_auth/server/firebase_server.ts` (lines 1–4 type imports; lines 112–113 dynamic imports)
- Modify: `package/src/firebase_auth/server/use_auth_user_server.ts:1`
- Modify: `package/src/firebase_auth/types.ts:1`
- Modify: `package/src/firebase_auth/client/auth_user_provider.tsx:18`
- Modify: `package/src/types/types.ts:7`
- Modify (test mocks, `vi.mock` specifiers): `package/src/firebase_auth/client/auth_actions.test.ts`, `auth_actions.bench.ts`, `auth_user_provider.test.tsx`, `components/auto_firebase_performance_events.test.tsx`, `firebase_client.test.ts`, `firebase_client.bench.ts`, `package/src/firebase_auth/server/firebase_server.test.ts`, `firebase_server.perf.test.ts`, `firebase_server.bench.ts`
- Modify: `package/src/firebase_auth/README.md` (the `import('firebase/performance')` reference on line 20)
- Test: `package/src/firebase_auth/require_config.test.ts` (new test appended)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing later tasks depend on. Module specifiers `firebase/app` → `@firebase/app`, `firebase/auth` → `@firebase/auth`, `firebase/app-check` → `@firebase/app-check`, `firebase/performance` → `@firebase/performance`. All imported symbol names are unchanged.

- [ ] **Step 1: Confirm the scoped packages expose everything this code uses**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
grep -rhoE "from '(firebase/[a-z-]+)'|import\('(firebase/[a-z-]+)'\)" src | sort -u
```

Expected: exactly four distinct specifiers — `firebase/app`, `firebase/app-check`, `firebase/auth`, `firebase/performance`. If a fifth appears, add its `@firebase/*` counterpart to every list in this task before continuing.

- [ ] **Step 2: Write the failing test that locks the swap in**

Append to `package/src/firebase_auth/require_config.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
            ? walk(resolve(dir, e.name))
            : /\.tsx?$/.test(e.name)
              ? [resolve(dir, e.name)]
              : [],
    );
}

describe('firebase_auth dependency surface', () => {
    it('depends on the scoped @firebase entry points, not the firebase umbrella', () => {
        const pkg = JSON.parse(
            readFileSync(resolve(here, '../../package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string> };
        const deps = pkg.dependencies ?? {};
        expect(deps['firebase']).toBeUndefined();
        expect(deps['@firebase/app']).toBeDefined();
        expect(deps['@firebase/auth']).toBeDefined();
        expect(deps['@firebase/app-check']).toBeDefined();
        expect(deps['@firebase/performance']).toBeDefined();
    });

    it('imports no bare "firebase/*" specifier anywhere in src', () => {
        const offenders = walk(resolve(here, '..')).filter((file) =>
            /['"]firebase\/[a-z-]+['"]/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/firebase_auth/require_config.test.ts -t 'dependency surface'`
Expected: FAIL on both cases — `expected "^12.17.0" to be undefined`, and a non-empty `offenders` array.

- [ ] **Step 4: Rewrite every specifier**

Run this from `package/`. It rewrites source, tests, benches and the module README in one pass:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
grep -rlE "['\"]firebase/(app|auth|app-check|performance)['\"]" src \
  | xargs sed -i '' -E "s#(['\"])firebase/(app-check|app|auth|performance)\1#\1@firebase/\2\1#g"
```

Note the alternation order (`app-check` before `app`) — reversing it would produce `@firebase/app-check` → `@firebase/app-check` mangling. Verify the result:

```bash
grep -rn "@firebase/" src | wc -l   # expect 19 source sites + the vi.mock sites
grep -rnE "['\"]firebase/" src      # expect zero output
```

- [ ] **Step 5: Swap the declared dependency**

In `package/package.json`, replace this line in `dependencies`:

```json
    "firebase": "^12.17.0",
```

with these four (keep the block alphabetically sorted — they belong at the top, before `@microsoft/clarity`):

```json
    "@firebase/app": "^0.15.0",
    "@firebase/app-check": "^0.11.0",
    "@firebase/auth": "^1.12.0",
    "@firebase/performance": "^0.7.0",
```

Then install and pin whatever npm resolves:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm install
npm ls @firebase/app @firebase/auth @firebase/app-check @firebase/performance
```

If any of the four caret ranges above fails to resolve, replace it with the range npm reports for the version that `firebase@12` itself depended on — read it from `package-lock.json` before this change, via `git show HEAD:package/package-lock.json | grep -A2 '"node_modules/@firebase/auth"'`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/firebase_auth/require_config.test.ts -t 'dependency surface'`
Expected: PASS on both cases.

- [ ] **Step 7: Run the full suite and the build**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm test
npm run build && npm run check:exports
```

Expected: all tests pass, 100% per-file coverage thresholds hold, `check_exports.mjs` exits 0. The `vi.mock('@firebase/auth', ...)` factories now intercept the renamed specifiers — if a Firebase test fails with a real-module error, the `sed` in Step 4 missed that file's `vi.mock` call; find it with `grep -rn "vi.mock('firebase" src` and fix it by hand.

- [ ] **Step 8: Measure the win**

Run:

```bash
rm -rf /tmp/cfni-size && mkdir -p /tmp/cfni-size && cd /tmp/cfni-size && npm init -y >/dev/null
npm i --omit=dev --ignore-scripts @microsoft/clarity@^1.0.2 drizzle-kit@^0.31.10 \
  drizzle-orm@^0.45.2 embedded-postgres@^18.4.0-beta.17 @firebase/app @firebase/auth \
  @firebase/app-check @firebase/performance jose@^6.2.8 pg@^8.23.0 sharp@^0.34.5
du -sh node_modules
```

Expected: **~243 MB**, down from 398 MB. Record the actual figure in the commit body.

- [ ] **Step 9: Verify the tarball still ships the required files**

Run: `npm pack --dry-run 2>&1 | grep -E "README.md|llms.txt"`
Expected: both listed. This is a Global Constraint — if either is missing, revert and investigate.

- [ ] **Step 10: Commit**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl
git add package/package.json package/package-lock.json package/src package/dist
git commit -m "perf: use scoped @firebase entry points instead of the firebase umbrella

Drops @firebase/firestore, database, ai, storage, data-connect, messaging,
every -compat shim, @grpc/* and @types/node from the install graph. All
Firebase imports were already type-only or dynamic, so the public surface
and tree-shaking behaviour are unchanged. Install: 398MB -> 243MB."
```

---

### Task 3: Spike — can PGlite replace `embedded-postgres` for DDL introspection?

`@embedded-postgres/darwin-arm64` is **144 MB**, the single largest line item and 36% of the remaining install. It is used in exactly one place — `bin/ephemeral_pg.mjs:31` — to start a throwaway Postgres that `drizzle-kit pull` and the `pg` client introspect over the wire protocol. `@electric-sql/pglite` + `@electric-sql/pglite-socket` provide the same wire-protocol contract in **26 MB**.

**This task is a spike with a real abandon condition.** PGlite is single-connection: `PGLiteSocketServer` serves one client at a time, and PGlite's role and extension support is narrower than a real server's. `bin/ephemeral_pg.mjs` issues `CREATE ROLE` for eight Supabase roles, `CREATE SCHEMA` for `auth`/`storage`/`extensions`, and `CREATE EXTENSION` for `uuid-ossp` and `pgcrypto`. If any of that fails, or if `drizzle-kit pull` opens a second concurrent connection, **stop and abandon the task** — write up the finding and leave `embedded-postgres` in place. Do not weaken the ephemeral database's fidelity to make the swap fit; a codegen step that silently introspects a less-capable Postgres is worse than 144 MB.

**Files:**
- Create: `package/scripts/spike_pglite.mjs` (throwaway — deleted at the end of the task either way)
- Modify (only if the spike succeeds): `package/bin/ephemeral_pg.mjs`, `package/package.json`
- Test (only if the spike succeeds): `package/src/db/codegen_paths.test.ts` (new test appended)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `startEphemeralPostgres(sqlFiles)` keeps its exact existing contract — returns `null` when the backing Postgres implementation is unavailable, otherwise `{ url, stop() }` where `url` is a `postgresql://` connection string reachable by both `pg`'s `Client` and `drizzle-kit pull`. No caller changes.

- [ ] **Step 1: Write the spike script**

Create `package/scripts/spike_pglite.mjs`:

```js
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Client } from 'pg';

const PORT = 54330;
const ROLES = [
    'anon', 'authenticated', 'service_role', 'authenticator',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin',
];

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();

const client = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await client.connect();

const results = [];
for (const role of ROLES) {
    await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT;`)
        .then(() => results.push(`ok   CREATE ROLE ${role}`))
        .catch((e) => results.push(`FAIL CREATE ROLE ${role}: ${e.message}`));
}
for (const schema of ['auth', 'storage', 'extensions']) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema};`)
        .then(() => results.push(`ok   CREATE SCHEMA ${schema}`))
        .catch((e) => results.push(`FAIL CREATE SCHEMA ${schema}: ${e.message}`));
}
for (const ext of ['uuid-ossp', 'pgcrypto']) {
    await client.query(`CREATE EXTENSION IF NOT EXISTS "${ext}";`)
        .then(() => results.push(`ok   CREATE EXTENSION ${ext}`))
        .catch((e) => results.push(`FAIL CREATE EXTENSION ${ext}: ${e.message}`));
}
await client.query('CREATE TABLE spike (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);')
    .then(() => results.push('ok   CREATE TABLE with gen_random_uuid default'))
    .catch((e) => results.push(`FAIL CREATE TABLE: ${e.message}`));

// The decisive check: a SECOND concurrent connection, which is what
// `drizzle-kit pull` may open while this one is still held.
const second = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await second.connect()
    .then(async () => {
        await second.query('SELECT 1;');
        results.push('ok   second concurrent connection');
        await second.end();
    })
    .catch((e) => results.push(`FAIL second concurrent connection: ${e.message}`));

console.log(results.join('\n'));
await client.end();
await server.stop();
await db.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
```

- [ ] **Step 2: Install the spike dependencies and run it**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm install --no-save @electric-sql/pglite @electric-sql/pglite-socket
node scripts/spike_pglite.mjs
```

Expected: every line starts with `ok`. Any `FAIL` line is the abandon signal — go to Step 3a. All `ok` — go to Step 3b.

- [ ] **Step 3a: ABANDON PATH — if any check failed**

Do this and nothing else:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
rm scripts/spike_pglite.mjs
git checkout package.json package-lock.json
npm install
```

Then append the finding to `docs/superpowers/specs/2026-08-30-install-size-reduction.md` under a new `## Outcome: lever C rejected` heading, quoting the exact `FAIL` lines. Report to the reviewer that Task 3 is closed as not-viable and that `embedded-postgres` stays. **Skip Steps 4–9.** Tasks 1 and 2 already delivered 155 MB; that stands on its own.

- [ ] **Step 3b: PROCEED PATH — if every check passed**

Continue to Step 4.

- [ ] **Step 4: Write the failing test**

Append to `package/src/db/codegen_paths.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');

describe('ephemeral postgres backing dependency', () => {
    it('uses PGlite rather than the 144MB embedded-postgres native build', () => {
        const pkg = JSON.parse(
            readFileSync(resolve(here, '../../package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string> };
        const deps = pkg.dependencies ?? {};
        expect(deps['embedded-postgres']).toBeUndefined();
        expect(deps['@electric-sql/pglite']).toBeDefined();
        expect(deps['@electric-sql/pglite-socket']).toBeDefined();
    });

    it('bin/ephemeral_pg.mjs no longer imports embedded-postgres', () => {
        const source = readFileSync(resolve(here, '../../bin/ephemeral_pg.mjs'), 'utf8');
        expect(source).not.toContain('embedded-postgres');
        expect(source).toContain('@electric-sql/pglite');
    });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/db/codegen_paths.test.ts -t 'ephemeral postgres backing'`
Expected: FAIL — `expected "^18.4.0-beta.17" to be undefined`

- [ ] **Step 6: Rewrite the ephemeral Postgres launcher**

In `package/bin/ephemeral_pg.mjs`, replace the header comment and the `EmbeddedPostgres` acquisition/startup block. Change the top-of-file comment (lines 1–3) to:

```js
// Spins up a throwaway, local-only Postgres (via PGlite, a WASM Postgres
// served over the real wire protocol — no Docker, no native server build)
// so `cfni-db-codegen` can introspect DDL without any external live Postgres.
```

Replace the dynamic-import block at line 29–34:

```js
    let EmbeddedPostgres;
    try {
        ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
    } catch {
        return null; // optional dep not installed — caller falls back to its normal error message
    }
```

with:

```js
    let PGlite, PGLiteSocketServer;
    try {
        ({ PGlite } = await import('@electric-sql/pglite'));
        ({ PGLiteSocketServer } = await import('@electric-sql/pglite-socket'));
    } catch {
        return null; // not installed — caller falls back to its normal error message
    }
```

Replace the instantiation block (the `rmSync(dataDir, ...)` call and `new EmbeddedPostgres({ ... })`) with:

```js
    rmSync(dataDir, { recursive: true, force: true });
    const db = await PGlite.create({ dataDir });
    const pg = new PGLiteSocketServer({ db, port: EPHEMERAL_PORT, host: '127.0.0.1' });
```

Replace the startup pair `await pg.initialise(); await pg.start();` with:

```js
        await pg.start();
```

and update the log line to:

```js
    console.log('ℹ️  Using PGlite (zero setup, no Docker) to introspect DDL…');
```

Finally, find the `stop()` implementation later in the file and make it stop the socket server *and* close the database — read the existing `stop()` body first and mirror its error handling, adding `await db.close();` after the existing server-stop call. Also update the two `embedded-postgres` mentions in the error text of `bin/db_codegen.mjs` (lines 58 and 60) and the fallback warning (line 110) to name PGlite, and change the install hint on line 60 to `npm install --save-dev @electric-sql/pglite @electric-sql/pglite-socket`.

- [ ] **Step 7: Swap the declared dependency**

In `package/package.json` `dependencies`, remove:

```json
    "embedded-postgres": "^18.4.0-beta.17",
```

and add (keeping the block sorted — these go first):

```json
    "@electric-sql/pglite": "^0.3.0",
    "@electric-sql/pglite-socket": "^0.0.11",
```

Then: `cd /Volumes/External/own_projects/cloudflare-next-intl/package && npm install`. If either caret range fails to resolve, use the version the Step 2 spike installed — read it from `npm ls @electric-sql/pglite @electric-sql/pglite-socket`.

- [ ] **Step 8: Run the test, then prove codegen still works end to end**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npx vitest run src/db/codegen_paths.test.ts -t 'ephemeral postgres backing'
npm test
npm run build && npm run check:exports
rm scripts/spike_pglite.mjs
```

Expected: the new test passes, the full suite passes, `check_exports.mjs` exits 0.

Then run the real CLI against the repo's own SQL, which is the only thing that proves `drizzle-kit pull` can drive PGlite:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/example
npx cfni-db-codegen
git diff --stat
```

Expected: the command completes and regenerates the Drizzle models with **no diff** against the committed output. A non-empty diff means PGlite introspects differently from a real Postgres — that is a `FAIL`, so revert this task via Step 3a's commands (plus `git checkout package/bin`) and close it as not-viable.

- [ ] **Step 9: Measure, verify the tarball, and commit**

```bash
rm -rf /tmp/cfni-size && mkdir -p /tmp/cfni-size && cd /tmp/cfni-size && npm init -y >/dev/null
npm i --omit=dev --ignore-scripts @microsoft/clarity@^1.0.2 drizzle-kit@^0.31.10 \
  drizzle-orm@^0.45.2 @electric-sql/pglite @electric-sql/pglite-socket @firebase/app \
  @firebase/auth @firebase/app-check @firebase/performance jose@^6.2.8 pg@^8.23.0 sharp@^0.34.5
du -sh node_modules
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm pack --dry-run 2>&1 | grep -E "README.md|llms.txt"
```

Expected: **~125 MB**; both `README.md` and `llms.txt` still listed.

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl
git add package/package.json package/package-lock.json package/bin package/src package/dist
git commit -m "perf: back the ephemeral codegen Postgres with PGlite instead of embedded-postgres

@embedded-postgres/<platform> ships a 144MB native PostgreSQL build for a
throwaway DDL-introspection database. PGlite serves the same wire protocol
from 26MB. Verified: Supabase role/schema/extension bootstrap, concurrent
connections, and a byte-identical cfni-db-codegen run. Install: 243MB -> 125MB."
```

---

### Task 4: Guard the win with a size regression check

Nothing above prevents the next contributor from re-adding `firebase` or `@supabase/supabase-js`. A cheap, dependency-free check in the existing `prepublishOnly` chain makes a regression loud at publish time.

**Files:**
- Create: `package/scripts/check_size.mjs`
- Modify: `package/package.json` (`scripts.check:size`, and `scripts.prepublishOnly`)
- Test: `package/scripts/check_size.mjs` is self-verifying — Step 4 runs it against a deliberately-bad input.

**Interfaces:**
- Consumes: the final `dependencies` block produced by Tasks 1–3.
- Produces: `npm run check:size` — exits 0 when clean, exits 1 and prints the offending dependency names otherwise.

- [ ] **Step 1: Write the check**

Create `package/scripts/check_size.mjs`:

```js
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// Packages whose install weight is disproportionate to what this package
// uses of them. Each maps to the lighter equivalent that replaced it. See
// docs/superpowers/specs/2026-08-30-install-size-reduction.md.
const BANNED = {
  'firebase': 'use the scoped @firebase/{app,auth,app-check,performance} entry points (156MB -> 23MB)',
  '@supabase/supabase-js': 'never imported — src/db/rest_client.ts types the PostgREST shape structurally',
  'embedded-postgres': 'use @electric-sql/pglite + @electric-sql/pglite-socket (144MB -> 26MB)',
};

// Both must always ship — see .agent/.sub-rules/packages/package-authoring.md.
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

- [ ] **Step 2: Wire it into the scripts**

In `package/package.json`, add to `scripts`:

```json
    "check:size": "node scripts/check_size.mjs",
```

and change `prepublishOnly` from `"npm run build && npm run check:exports"` to:

```json
    "prepublishOnly": "npm run build && npm run check:exports && npm run check:size",
```

- [ ] **Step 3: Run it to verify it passes on the current tree**

Run: `cd /Volumes/External/own_projects/cloudflare-next-intl/package && npm run check:size`
Expected: `OK: 8 dependencies, no banned packages, README.md + llms.txt ship.` (the count is 8 after Tasks 1–3, or 9 if Task 3 was abandoned — either is fine, the script does not assert a count).

- [ ] **Step 4: Verify it actually fails on a bad input**

Run:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.dependencies.firebase='^12.0.0';fs.writeFileSync('/tmp/bad-package.json',JSON.stringify(p,null,2))"
cp package.json /tmp/good-package.json && cp /tmp/bad-package.json package.json
npm run check:size; echo "exit=$?"
cp /tmp/good-package.json package.json
```

Expected: prints `dependency "firebase" is banned: ...` and `exit=1`. Then the restore puts the good file back — confirm with `npm run check:size` printing `OK` again.

If Task 3 was abandoned, `embedded-postgres` is still a legitimate dependency: delete its entry from `BANNED` in `check_size.mjs` before Step 3, or the check will fail the current tree.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl
git add package/package.json package/scripts/check_size.mjs
git commit -m "chore: add check:size guard against re-adding heavy dependencies"
```

---

### Task 5: Document the outcome

**Files:**
- Modify: `.agent/.sub-rules/packages/package-authoring.md` (the "Package size restrictions" section)
- Modify: `package/CHANGELOG.md`

**Interfaces:**
- Consumes: the measured figures from Tasks 1–3.
- Produces: nothing.

- [ ] **Step 1: Record the allowed levers in the rules file**

Append to the `## Package size restrictions` section of `.agent/.sub-rules/packages/package-authoring.md`, after the two existing bullets:

```markdown
- **Do** cut install weight by (a) deleting a dependency nothing imports,
  (b) swapping an umbrella package for the scoped entry points actually
  used (`firebase` → `@firebase/{app,auth,app-check,performance}`), and
  (c) swapping a heavy dependency for a lighter package that satisfies the
  same contract (`embedded-postgres` → `@electric-sql/pglite`). All three
  keep the dependency in `dependencies`, so none is a placement move.
- `npm run check:size` enforces this — it fails the build if a banned
  heavy package reappears in `dependencies` or if `README.md`/`llms.txt`
  leave the `files` field. Add to `BANNED` in
  `package/scripts/check_size.mjs` whenever a swap like the above lands.
```

- [ ] **Step 2: Add the changelog entry**

Prepend a new entry to `package/CHANGELOG.md` matching the file's existing heading format (read the top 20 lines first and mirror it exactly). Content:

```markdown
### Performance

- Cut the installed dependency footprint from **398 MB to ~125 MB** with no
  change to the public API. Replaced the `firebase` umbrella with the four
  scoped `@firebase/*` entry points the package actually imports, dropped
  the never-imported `@supabase/supabase-js`, and backed the ephemeral
  codegen database with PGlite instead of a 144 MB native PostgreSQL build.
  Consumers get this by upgrading; no code changes required.
```

If Task 3 was abandoned, write **398 MB to 243 MB** and drop the PGlite clause.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl
git add .agent/.sub-rules/packages/package-authoring.md package/CHANGELOG.md
git commit -m "docs: record install-size reduction and the allowed size levers"
```
