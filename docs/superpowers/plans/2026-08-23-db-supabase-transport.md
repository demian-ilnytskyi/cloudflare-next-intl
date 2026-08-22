# Supabase Transport for the `db` Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the `db` module talk to Supabase using only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, while `withPublicDb`/`withUserDb` call sites stay byte-for-byte identical to connection-string mode.

**Architecture:** Drizzle cannot speak PostgREST, and a Postgres password cannot be derived from an anon key, so Supabase mode keeps the Drizzle *query builder* and swaps only the *transport*. `drizzle-orm/pg-proxy` accepts a `RemoteCallback (sql, params, method) => { rows }`; we implement that callback with `@supabase/supabase-js`'s `createClient(...).rpc(execFunction, { statement, params })` against a `security invoker` Postgres function exposed over PostgREST — matching the server-side client pattern in the reference implementation (`createClient` + an `accessToken` callback), and letting the library own header construction and error-shape parsing instead of hand-rolled `fetch`. Identity comes from the request's `Authorization` header — the anon key for `withPublicDb`, the Firebase ID token for `withUserDb`, both delivered via that `accessToken` callback — so PostgREST resolves `anon` / `authenticated` and RLS applies natively, with no role-switching primitive anywhere in the SQL we ship. Mode is chosen by which `db` config fields are present; the two modes share one `DrizzleDb` callback type.

**Tech Stack:** TypeScript (strict), `drizzle-orm/pg-proxy`, `pg` (existing mode only), `@supabase/supabase-js`, Vitest.

**Spec:** This document. Derived from the user's requirements in-session plus two reference implementations that establish the auth pattern to mirror:
- `/Volumes/External/clarivant/CRV/src/shared/data_provider/supabase_data_provider.ts` (server client, `accessToken` → Firebase ID token)
- `/Volumes/External/clarivant/CRV/src/shared/data_provider/supabase_client_provider.ts` (browser client — **out of scope**, see Global Constraints)

## Global Constraints

- **Only two Supabase secrets.** The consumer configures `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` and nothing more. No database password, no service-role key, no pooler string. Any design step that needs a third secret is wrong.
- **Identical call sites.** `await withPublicDb((db) => db.select().from(t))` and `await withUserDb((db) => …)` must compile and behave the same in both modes. Switching backends is a `setIntlConfig` change only — never an app-code change.
- **Server-only.** No browser entry point. Do not add `@supabase/ssr` or a `createBrowserClient` path — that package is for cookie-based browser sessions, which this module never needs (identity always comes from an explicit bearer token, server-side).
- **New runtime dependency, lazily loaded.** Supabase mode uses `@supabase/supabase-js`'s `createClient`, imported the same way `pg`/`drizzle-orm` are: via dynamic `import()` inside the functions that use it, so it only bundles for apps that actually call a `db` export.
- **Lazy loading preserved.** `pg` and `drizzle-orm` must stay behind dynamic `import()` inside the functions that use them, so an app that never calls a `db` export never bundles them.
- **Existing behaviour is untouched.** Connection-string / Hyperdrive mode keeps its current transaction-based `set_config` + `set local role` implementation. All 680 existing tests must still pass.
- **Coverage gate.** `package/vitest.config.ts` enforces `statements/branches/functions/lines = 100` per file for `src/**` (except `general_functions.ts` and `middleware.ts`). Every new file needs exhaustive tests, including each error branch.
- **Style.** 4-space indent, single quotes, no code comments except where a non-obvious *why* needs recording (see `.claude/CLAUDE.md`). JSDoc on every exported symbol.
- **Commands** (run from `package/`): `npx vitest run <path>`, `npx tsc -p tsconfig.build.json --noEmit`, `npx eslint src/db --max-warnings=0`, `npm run build`.

## Design Decisions (read before Task 1)

**Why `pg-proxy` for the query API, `@supabase/supabase-js` for the wire call.** The requirement is an identical Drizzle call site. `supabase-js`'s `.from().select()` builder is a different API — using it *as the query layer* would force app-code changes on switch, violating the core constraint. `pg-proxy` keeps Drizzle as the only query API; `supabase-js`'s `createClient(...).rpc(...)` is used only as pg-proxy's transport, the same role a hand-rolled `fetch` call would have played, but with header/error handling delegated to a maintained library — matching the user's ask and the reference implementation's own use of `createClient`.

**Why the RPC returns positional arrays.** `pg-proxy`'s session calls `mapResultRow(fields, row, …)` for `method: 'all'`, which indexes `row` by column *position*. Returning JSON objects silently yields `undefined` columns. Rows must be arrays of values in `select`-list order — hence `json_build_array(t.*)` in the SQL function.

**Why identity comes from the JWT, not from `set role`.** `drizzle-orm/pg-proxy` throws `Transactions are not supported by the Postgres Proxy driver` on `.transaction()`, so Supabase mode cannot reuse the existing `withUserDb` implementation (which opens a transaction to run `set_config` + `set local role`). Passing a target role into the SQL function instead would hand an anon caller a role-switch primitive — a privilege-escalation hole. Sending the Firebase ID token as `Authorization: Bearer` makes PostgREST resolve the role and populate `request.jwt.claims` itself, exactly as the reference implementation does, so the shipped function needs no elevated capability at all.

**Documented semantic difference (must land in README, Task 7).** In Supabase mode each statement inside a `withUserDb` callback is its own round-trip and therefore its own implicit transaction. Multi-statement atomicity is available in connection-string mode only. This is inherent to PostgREST and must be stated plainly rather than papered over.

**Security note (must land in README, Task 7).** The shipped `cfni_exec` function executes caller-supplied SQL. It is `security invoker`, so it can do only what the calling role (`anon` / `authenticated`) could already do and RLS still applies — but arbitrary SQL is a wider surface than PostgREST's normal REST verbs. README must tell users to `revoke execute … from anon` when their app only uses `withUserDb`, and to keep table grants minimal.

## File Structure

| File | Responsibility |
|---|---|
| `src/db/resolve_mode.ts` (create) | Pure function: `db` config → `'postgres' \| 'supabase'`, with actionable errors for missing/ambiguous config. |
| `src/db/supabase_config.ts` (create) | Resolves `url`/`anonKey` from config, falling back to `NEXT_PUBLIC_SUPABASE_*` env vars. |
| `src/db/access_token.ts` (create) | Resolves the caller's JWT for `withUserDb`: `db.getAccessToken()` → Firebase `getIdToken()`. |
| `src/db/supabase_transport.ts` (create) | Builds the `pg-proxy` `RemoteCallback`: calls `createClient(...).rpc('cfni_exec', { statement, params })` via `@supabase/supabase-js`, maps errors, returns `{ rows }`. |
| `src/db/context.ts` (modify) | Dispatches on mode; keeps `withPublicDb`/`withUserDb` signatures unchanged. |
| `src/types/types.ts` (modify) | Adds `DbRoutingConfig.supabase` and `DbRoutingConfig.getAccessToken`. |
| `src/db/index.ts` (modify) | Module doc covering both modes. |
| `README.md` (modify) | Both modes, the SQL to install, the atomicity caveat, the security note. |
| `supabase/cfni_exec.sql` (create, package root) | The `security invoker` function users install. Shipped via `files`. |

Each new file is small and single-purpose so it can be reasoned about and tested in isolation, matching the existing `db/` layout (`require_config.ts`, `codegen_paths.ts` are the same shape).

---

### Task 1: Mode resolution

**Files:**
- Create: `package/src/db/resolve_mode.ts`
- Test: `package/src/db/resolve_mode.test.ts`

**Interfaces:**
- Consumes: `DbRoutingConfig` from `../types/types` (extended in Task 2; this task only reads `connectionString`, `hyperdriveBinding`, `supabase`).
- Produces: `export type DbMode = 'postgres' | 'supabase'` and `export default function resolveDbMode(db: DbRoutingConfig): DbMode`.

- [ ] **Step 1: Write the failing test**

Create `package/src/db/resolve_mode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import resolveDbMode from './resolve_mode';

describe('resolveDbMode', () => {
    it('picks postgres for a connection string', () => {
        expect(resolveDbMode({ connectionString: 'postgresql://x' })).toBe('postgres');
    });

    it('picks postgres for a hyperdrive binding', () => {
        expect(resolveDbMode({ hyperdriveBinding: 'HYPERDRIVE' })).toBe('postgres');
    });

    it('picks supabase when a supabase block is set', () => {
        expect(resolveDbMode({ supabase: {} })).toBe('supabase');
    });

    it('prefers postgres when both are configured', () => {
        expect(resolveDbMode({ connectionString: 'postgresql://x', supabase: {} })).toBe('postgres');
    });

    it('defaults to postgres when nothing is set, so the existing hyperdrive default still applies', () => {
        expect(resolveDbMode({})).toBe('postgres');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/resolve_mode.test.ts`
Expected: FAIL — `Failed to resolve import "./resolve_mode"`.

- [ ] **Step 3: Write minimal implementation**

Create `package/src/db/resolve_mode.ts`:

```typescript
import type { DbRoutingConfig } from '../types/types';

/** Which transport the `db` exports use for a given config. */
export type DbMode = 'postgres' | 'supabase';

/**
 * Decides how to reach the database from the shape of the `db` config.
 *
 * Direct Postgres wins whenever it is configured, so adding a `supabase`
 * block to an existing config never silently reroutes live traffic. With
 * neither set the result is still `'postgres'`, which lets
 * `connectToPostgres` raise its existing, more specific error about the
 * missing Hyperdrive binding.
 *
 * @param db The `db` field off your routing config.
 * @returns `'postgres'` for connection-string/Hyperdrive access, `'supabase'`
 * for PostgREST access.
 */
export default function resolveDbMode(db: DbRoutingConfig): DbMode {
    if (db.connectionString || db.hyperdriveBinding) return 'postgres';
    return db.supabase ? 'supabase' : 'postgres';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/resolve_mode.test.ts`
Expected: PASS (5 tests). This will not typecheck until Task 2 adds `supabase` to the type — that is expected; do not add the field here.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/resolve_mode.ts package/src/db/resolve_mode.test.ts
git commit -m "feat(db): add transport mode resolution"
```

---

### Task 2: Config surface

**Files:**
- Modify: `package/src/types/types.ts` (the `DbRoutingConfig` interface, currently ending at `disconnectTimeoutMs`)

**Interfaces:**
- Produces: `DbRoutingConfig.supabase?: SupabaseDbConfig` and `DbRoutingConfig.getAccessToken?: () => Promise<string | null> | string | null`; `export interface SupabaseDbConfig { url?: string; anonKey?: string; execFunction?: string }`.

- [ ] **Step 1: Add the `SupabaseDbConfig` interface**

Insert immediately **above** `export interface DbRoutingConfig {` in `package/src/types/types.ts`:

```typescript
export interface SupabaseDbConfig {
    /**
     * Supabase project URL, e.g. `https://abc.supabase.co`. Defaults to
     * `process.env.NEXT_PUBLIC_SUPABASE_URL`.
     */
    url?: string;
    /**
     * Supabase anon (publishable) key. Defaults to
     * `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. This is the only key the
     * `db` module ever needs — never put a service-role key here.
     */
    anonKey?: string;
    /**
     * Name of the Postgres function that runs the generated SQL. Defaults to
     * `'cfni_exec'` — the function shipped in `supabase/cfni_exec.sql`.
     */
    execFunction?: string;
}
```

- [ ] **Step 2: Add the two `DbRoutingConfig` fields**

Insert **after** the existing `disconnectTimeoutMs` field, still inside `DbRoutingConfig`:

```typescript
    /**
     * Reaches Postgres through the Supabase Data API instead of a direct
     * connection, using only your project URL and anon key. Set this when you
     * have no Postgres password to give the package — `withPublicDb` and
     * `withUserDb` behave the same either way, so switching is a config change
     * with no app-code change.
     *
     * Ignored when `connectionString` or `hyperdriveBinding` is set: a direct
     * connection always wins, so adding this block cannot silently reroute
     * live traffic. Requires the `cfni_exec` function from
     * `supabase/cfni_exec.sql` to be installed in your database.
     */
    supabase?: SupabaseDbConfig;
    /**
     * Resolves the JWT sent as `Authorization: Bearer` for `withUserDb` in
     * Supabase mode, which is what makes PostgREST resolve the caller as
     * `authenticated` and apply RLS. Omit when `firebaseAuth` is configured —
     * the signed-in user's Firebase ID token is then used automatically.
     *
     * Unused in connection-string mode, which identifies the user with
     * `getUserId` and `set_config` instead.
     */
    getAccessToken?: () => Promise<string | null> | string | null;
```

- [ ] **Step 3: Verify the type compiles and Task 1 now typechecks**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: `No errors found`.

- [ ] **Step 4: Verify Task 1's tests still pass**

Run: `npx vitest run src/db/resolve_mode.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/types/types.ts
git commit -m "feat(db): add supabase and getAccessToken config fields"
```

---

### Task 3: Supabase endpoint resolution

**Files:**
- Create: `package/src/db/supabase_config.ts`
- Test: `package/src/db/supabase_config.test.ts`

**Interfaces:**
- Consumes: `SupabaseDbConfig` from `../types/types`.
- Produces: `export interface ResolvedSupabaseEndpoint { url: string; anonKey: string }` and `export default function resolveSupabaseEndpoint(supabase: SupabaseDbConfig): ResolvedSupabaseEndpoint`.

- [ ] **Step 1: Write the failing test**

Create `package/src/db/supabase_config.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import resolveSupabaseEndpoint from './supabase_config';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe('resolveSupabaseEndpoint', () => {
    it('resolves the url and anon key from explicit config', () => {
        const result = resolveSupabaseEndpoint({ url: 'https://abc.supabase.co', anonKey: 'key' });
        expect(result).toEqual({ url: 'https://abc.supabase.co', anonKey: 'key' });
    });

    it('strips a trailing slash from the project url', () => {
        const result = resolveSupabaseEndpoint({ url: 'https://abc.supabase.co/', anonKey: 'key' });
        expect(result.url).toBe('https://abc.supabase.co');
    });

    it('falls back to the NEXT_PUBLIC env vars', () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://env.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'env-key';
        const result = resolveSupabaseEndpoint({});
        expect(result).toEqual({ url: 'https://env.supabase.co', anonKey: 'env-key' });
    });

    it('throws naming the env var when no url resolves', () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        expect(() => resolveSupabaseEndpoint({ anonKey: 'key' })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it('throws naming the env var when no anon key resolves', () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        expect(() => resolveSupabaseEndpoint({ url: 'https://abc.supabase.co' })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/supabase_config.test.ts`
Expected: FAIL — `Failed to resolve import "./supabase_config"`.

- [ ] **Step 3: Write minimal implementation**

Create `package/src/db/supabase_config.ts`:

```typescript
import type { SupabaseDbConfig } from '../types/types';

/** The Supabase project URL and anon key the transport builds a client from. */
export interface ResolvedSupabaseEndpoint {
    /** Project URL, trailing slashes stripped. */
    url: string;
    /** Anon key, sent as both `apikey` and the public-mode bearer token. */
    anonKey: string;
}

/**
 * Resolves the Supabase project URL and anon key, preferring explicit config
 * over the `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * environment variables.
 *
 * @param supabase The `db.supabase` config block.
 * @returns The project URL and anon key to build a Supabase client from.
 * @throws If neither config nor environment supplies a URL or an anon key.
 */
export default function resolveSupabaseEndpoint(supabase: SupabaseDbConfig): ResolvedSupabaseEndpoint {
    const url = supabase.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
        throw new Error(
            'db: could not resolve a Supabase project URL. Set `db.supabase.url` ' +
            'or the NEXT_PUBLIC_SUPABASE_URL environment variable.',
        );
    }
    const anonKey = supabase.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
        throw new Error(
            'db: could not resolve a Supabase anon key. Set `db.supabase.anonKey` ' +
            'or the NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.',
        );
    }
    return { url: url.replace(/\/+$/, ''), anonKey };
}
```

- [ ] **Step 4: Run test to verify it passes**

Update the test file's expectations first: this task's Step 1 test asserted a `rpcUrl` field, which no longer exists now that `supabase-js` builds the request URL itself. Before running, replace every `{ rpcUrl: '...', anonKey }` expectation in `supabase_config.test.ts` with `{ url: '...', anonKey }` (matching the `ResolvedSupabaseEndpoint` shape above), and delete the `'honours a custom exec function name'` test — `execFunction` is consumed directly by the transport in Task 5, not by this resolver.

Run: `npx vitest run src/db/supabase_config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/db/supabase_config.ts package/src/db/supabase_config.test.ts
git commit -m "feat(db): resolve supabase endpoint from config or env"
```

---

### Task 4: Access-token resolution

**Files:**
- Create: `package/src/db/access_token.ts`
- Test: `package/src/db/access_token.test.ts`

**Interfaces:**
- Consumes: `DbConfig` from `./connection`; `requireDbConfig` from `./require_config`; `getAuthUser` from `../firebase_auth/server/use_auth_user_server` (dynamic import, mirroring `resolveUserId` in `context.ts`).
- Produces: `export default async function resolveAccessToken(config: DbConfig): Promise<string>`.

Mirrors `resolveUserId`'s resolution order and dynamic-import style so the two identity paths read the same. `getIdToken(false)` matches the reference implementation — no forced refresh.

- [ ] **Step 1: Write the failing test**

Create `package/src/db/access_token.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getAuthUser, getIdToken } = vi.hoisted(() => {
    const getIdToken = vi.fn().mockResolvedValue('firebase-jwt');
    const getAuthUser = vi.fn().mockResolvedValue({ user: { getIdToken }, loading: false });
    return { getAuthUser, getIdToken };
});
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));

import resolveAccessToken from './access_token';

const base = { locales: ['en'] as const, defaultLocale: 'en' };

beforeEach(() => {
    getAuthUser.mockClear();
    getIdToken.mockClear();
    getAuthUser.mockResolvedValue({ user: { getIdToken }, loading: false });
});

describe('resolveAccessToken', () => {
    it('throws when db config is missing', async () => {
        await expect(resolveAccessToken({ ...base } as never)).rejects.toThrow(/`db` is not set/);
    });

    it('prefers db.getAccessToken', async () => {
        const getAccessToken = vi.fn().mockResolvedValue('config-jwt');
        const config = { ...base, db: { supabase: {}, getAccessToken } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('config-jwt');
        expect(getAuthUser).not.toHaveBeenCalled();
    });

    it('accepts a synchronous getAccessToken', async () => {
        const config = { ...base, db: { supabase: {}, getAccessToken: () => 'sync-jwt' } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('sync-jwt');
    });

    it('falls back to the firebase id token', async () => {
        const config = { ...base, db: { supabase: {} }, firebaseAuth: { apiKey: 'k' } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('firebase-jwt');
        expect(getIdToken).toHaveBeenCalledWith(false);
    });

    it('throws when getAccessToken returns nothing and firebase is absent', async () => {
        const config = { ...base, db: { supabase: {}, getAccessToken: () => null } } as never;
        await expect(resolveAccessToken(config)).rejects.toThrow(/access token/i);
    });

    it('throws when firebase is configured but nobody is signed in', async () => {
        getAuthUser.mockResolvedValue({ user: null, loading: false });
        const config = { ...base, db: { supabase: {} }, firebaseAuth: { apiKey: 'k' } } as never;
        await expect(resolveAccessToken(config)).rejects.toThrow(/access token/i);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/access_token.test.ts`
Expected: FAIL — `Failed to resolve import "./access_token"`.

- [ ] **Step 3: Write minimal implementation**

Create `package/src/db/access_token.ts`:

```typescript
import type { DbConfig } from './connection';
import requireDbConfig from './require_config';

/**
 * Resolves the JWT that identifies the caller to Supabase, trying
 * `db.getAccessToken()` first, then the signed-in Firebase user's ID token.
 *
 * PostgREST reads this token to pick the caller's role and populate
 * `request.jwt.claims`, which is what makes RLS behave the same as it does in
 * connection-string mode.
 *
 * @param config Your routing config; `config.db` must be set.
 * @returns The bearer token to send with the request.
 * @throws If `db` is not set, or no token can be resolved.
 */
export default async function resolveAccessToken(config: DbConfig): Promise<string> {
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getAccessToken?.();
    if (fromConfig) return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server');
        const { user } = await getAuthUser();
        const token = await user?.getIdToken(false);
        if (token) return token;
    }
    throw new Error(
        'db: withUserDb could not resolve an access token for Supabase. Set ' +
        '`db.getAccessToken`, or configure `firebaseAuth` so the signed-in ' +
        'user\'s Firebase ID token is used.',
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/access_token.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/db/access_token.ts package/src/db/access_token.test.ts
git commit -m "feat(db): resolve supabase access token from config or firebase"
```

---

### Task 5: The Supabase transport

**Files:**
- Create: `package/src/db/supabase_transport.ts`
- Test: `package/src/db/supabase_transport.test.ts`
- Modify: `package/package.json` (`dependencies`)

**Interfaces:**
- Consumes: `resolveSupabaseEndpoint` (Task 3), `SupabaseDbConfig` from `../types/types`, `createClient` from `@supabase/supabase-js` (dynamic import).
- Produces: `export default function createSupabaseTransport(supabase: SupabaseDbConfig, bearerToken: string): SupabaseRemoteCallback`, where `SupabaseRemoteCallback` is `(sql: string, params: unknown[], method: 'all' | 'execute') => Promise<{ rows: unknown[] }>` — structurally the type `drizzle-orm/pg-proxy` expects.

The returned rows must be **positional arrays**; see Design Decisions. The transport passes them through unchanged and relies on `cfni_exec` to shape them. `@supabase/supabase-js` is imported dynamically, same as `pg`/`drizzle-orm`, so it never bundles for an app that doesn't use Supabase mode.

- [ ] **Step 1: Add the dependency**

In `package/package.json`, add to `"dependencies"` (alongside the `drizzle-orm`/`pg` entries added earlier in this codebase's history):

```json
"@supabase/supabase-js": "^2.112.3",
```

Run `npm install` from `package/` and confirm it lands in `package/node_modules/@supabase/supabase-js`.

- [ ] **Step 2: Write the failing test**

Create `package/src/db/supabase_transport.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, createClientMock } = vi.hoisted(() => {
    const rpc = vi.fn();
    const createClientMock = vi.fn(() => ({ rpc }));
    return { rpc, createClientMock };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import createSupabaseTransport from './supabase_transport';

const endpoint = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };

beforeEach(() => {
    rpc.mockReset();
    createClientMock.mockClear();
});

describe('createSupabaseTransport', () => {
    it('builds a client for the resolved project and forwards the bearer token via accessToken', async () => {
        rpc.mockResolvedValue({ data: [[1, 'a']], error: null });
        const transport = createSupabaseTransport(endpoint, 'user-jwt');
        await transport('select $1', ['x'], 'all');

        const [url, key, options] = createClientMock.mock.calls[0];
        expect(url).toBe('https://abc.supabase.co');
        expect(key).toBe('anon-key');
        await expect(options.accessToken()).resolves.toBe('user-jwt');
    });

    it('calls the configured exec function with statement and params', async () => {
        rpc.mockResolvedValue({ data: [[1, 'a']], error: null });
        const transport = createSupabaseTransport({ ...endpoint, execFunction: 'run_sql' }, 'anon-key');
        const result = await transport('select $1', ['x'], 'all');

        expect(result).toEqual({ rows: [[1, 'a']] });
        expect(rpc).toHaveBeenCalledWith('run_sql', { statement: 'select $1', params: ['x'] });
    });

    it('defaults the exec function to cfni_exec', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        expect(rpc).toHaveBeenCalledWith('cfni_exec', { statement: 'select 1', params: [] });
    });

    it('returns an empty row set when the function yields null', async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('update t set a = 1', [], 'execute')).resolves.toEqual({ rows: [] });
    });

    it('surfaces the postgrest error message', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'function cfni_exec does not exist', code: '42883' } });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).rejects.toThrow(/function cfni_exec does not exist/);
    });

    it('names the install step when postgrest reports a missing function', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).rejects.toThrow(/cfni_exec\.sql/);
    });

    it('reuses one client across multiple calls with the same bearer token', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        await transport('select 2', [], 'all');
        expect(createClientMock).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/supabase_transport.test.ts`
Expected: FAIL — `Failed to resolve import "./supabase_transport"`.

- [ ] **Step 4: Write minimal implementation**

Create `package/src/db/supabase_transport.ts`:

```typescript
import type { SupabaseDbConfig } from '../types/types';
import resolveSupabaseEndpoint from './supabase_config';

const DEFAULT_EXEC_FUNCTION = 'cfni_exec';

/**
 * The executor shape `drizzle-orm/pg-proxy` calls with each generated
 * statement. Declared structurally so this file never imports `drizzle-orm`.
 */
export type SupabaseRemoteCallback = (
    sql: string,
    params: unknown[],
    method: 'all' | 'execute',
) => Promise<{ rows: unknown[] }>;

/**
 * Builds the transport Drizzle uses in Supabase mode: every generated
 * statement is sent through `@supabase/supabase-js`'s `.rpc()` to the
 * `cfni_exec` function over PostgREST.
 *
 * `bearerToken` decides who Postgres thinks is calling — the anon key for
 * public reads, a user's JWT for `withUserDb` — delivered through the
 * client's `accessToken` option (the same mechanism a signed-in Supabase
 * session would use), so RLS is enforced by the database rather than by
 * anything in this package. The client is created once and reused for every
 * statement this transport is asked to run.
 *
 * Rows come back as positional arrays because `pg-proxy` maps result columns
 * by index; `cfni_exec` is what guarantees that shape.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken Token resolved as the caller's identity — the anon key,
 * or a per-request user JWT.
 * @returns A callback suitable for `drizzle-orm/pg-proxy`'s `drizzle()`.
 */
export default function createSupabaseTransport(
    supabase: SupabaseDbConfig,
    bearerToken: string,
): SupabaseRemoteCallback {
    const { url, anonKey } = resolveSupabaseEndpoint(supabase);
    const execFunction = supabase.execFunction ?? DEFAULT_EXEC_FUNCTION;
    let clientPromise: Promise<{ rpc: (fn: string, args: unknown) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> }> | null = null;

    async function getClient() {
        clientPromise ??= (async () => {
            const { createClient } = await import('@supabase/supabase-js');
            return createClient(url, anonKey, { accessToken: async () => bearerToken });
        })();
        return clientPromise;
    }

    return async (sql, params) => {
        const client = await getClient();
        const { data, error } = await client.rpc(execFunction, { statement: sql, params });
        if (error) throw new Error(describeFailure(error, execFunction));
        return { rows: Array.isArray(data) ? data : [] };
    };
}

function describeFailure(error: { message: string; code?: string }, execFunction: string): string {
    // PGRST202 is PostgREST's "no such function" — by far the most likely
    // first-run failure, so point at the install step instead of the raw code.
    if (error.code === 'PGRST202') {
        return `db: Supabase rejected the query — ${error.message}. Install the ${execFunction} function from supabase/cfni_exec.sql in your database.`;
    }
    return `db: Supabase rejected the query — ${error.message}.`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/db/supabase_transport.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src/db/supabase_transport.ts package/src/db/supabase_transport.test.ts package/package.json package/package-lock.json
git commit -m "feat(db): add supabase-js transport for drizzle pg-proxy"
```

---

### Task 6: Wire both modes into `withPublicDb` / `withUserDb`

**Files:**
- Modify: `package/src/db/context.ts`
- Modify: `package/src/db/context.test.ts`
- Create: `package/supabase/cfni_exec.sql`
- Modify: `package/package.json` (the `files` array, so the SQL ships)

**Interfaces:**
- Consumes: `resolveDbMode` (Task 1), `createSupabaseTransport` (Task 5), `resolveAccessToken` (Task 4), `resolveSupabaseEndpoint` (Task 3, transitively).
- Produces: unchanged public signatures — `withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T>` and `withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T>`.

In Supabase mode `withUserDb` does **not** open a Drizzle transaction (`pg-proxy` throws on `.transaction()`); the JWT carries the identity instead, and `uid` is only consulted in Postgres mode.

- [ ] **Step 1: Write the failing tests**

Append to `package/src/db/context.test.ts`. The existing hoisted mocks stay; add a `pg-proxy` mock beside the existing `drizzle-orm/node-postgres` one, and a fetch stub.

At the top of the file, extend the hoisted block and mocks:

```typescript
const { proxyDrizzle, proxyDb } = vi.hoisted(() => {
    const proxyDb = { select: vi.fn(), execute: vi.fn() };
    const proxyDrizzle = vi.fn(() => proxyDb);
    return { proxyDrizzle, proxyDb };
});
vi.mock('drizzle-orm/pg-proxy', () => ({ drizzle: proxyDrizzle }));
```

Then add this suite at the end of the file:

```typescript
describe('supabase mode', () => {
    beforeEach(() => {
        proxyDrizzle.mockClear();
        connectToPostgres.mockClear();
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' } };
    });

    it('withPublicDb never opens a postgres connection', async () => {
        const result = await withPublicDb(async (db) => { expect(db).toBe(proxyDb); return 7; });
        expect(result).toBe(7);
        expect(connectToPostgres).not.toHaveBeenCalled();
        expect(disconnectPostgres).not.toHaveBeenCalled();
        expect(proxyDrizzle).toHaveBeenCalledTimes(1);
    });

    it('withUserDb runs without a drizzle transaction', async () => {
        config.db = { supabase: {}, getAccessToken: () => 'user-jwt' };
        const result = await withUserDb(async (db) => { expect(db).toBe(proxyDb); return 'ok'; });
        expect(result).toBe('ok');
        expect(transaction).not.toHaveBeenCalled();
        expect(tx.execute).not.toHaveBeenCalled();
    });

    it('withUserDb surfaces a missing access token', async () => {
        config.db = { supabase: {}, getAccessToken: () => null };
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/access token/i);
    });

    it('still routes to postgres when a connection string is also set', async () => {
        config.db = { connectionString: 'postgresql://x', supabase: {} };
        await withPublicDb(async () => 1);
        expect(connectToPostgres).toHaveBeenCalledTimes(1);
        expect(proxyDrizzle).not.toHaveBeenCalled();
    });
});
```

`config.db` is reset by the file's existing `beforeEach`, so the Postgres suites are unaffected. Set `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` in the `getAccessToken`-only cases via `vi.stubEnv`, or pass `url`/`anonKey` explicitly as above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/context.test.ts`
Expected: FAIL — Supabase cases call `connectToPostgres` / `drizzle` from `node-postgres` because dispatch does not exist yet.

- [ ] **Step 3: Implement dispatch in `context.ts`**

Add imports beside the existing ones:

```typescript
import resolveDbMode from './resolve_mode';
import createSupabaseTransport from './supabase_transport';
import resolveAccessToken from './access_token';
```

Add this helper above `withPublicDb`:

```typescript
/**
 * Builds a Drizzle handle backed by PostgREST. `bearerToken` decides the role
 * Postgres sees: the anon key for public access, a user JWT for `withUserDb`.
 */
async function supabaseDb(supabase: SupabaseDbConfig, bearerToken: string): Promise<DrizzleDb> {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    return drizzle(createSupabaseTransport(supabase, bearerToken)) as unknown as DrizzleDb;
}
```

Import the type it needs: add `SupabaseDbConfig` to the existing `../types/types` import (add such an import if `context.ts` has none).

Replace the body of `withPublicDb` with:

```typescript
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    if (resolveDbMode(db) === 'supabase') {
        const supabase = db.supabase ?? {};
        const { anonKey } = resolveSupabaseEndpoint(supabase);
        return fn(await supabaseDb(supabase, anonKey));
    }
    const client = await connectToPostgres(config);
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        return await fn(drizzle(client) as unknown as DrizzleDb);
    } finally {
        disconnectPostgres(config);
    }
}
```

Add `import resolveSupabaseEndpoint from './supabase_config';` — public mode authenticates as the anon key itself, which is how PostgREST resolves the `anon` role.

Replace the body of `withUserDb` with:

```typescript
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    if (resolveDbMode(db) === 'supabase') {
        // pg-proxy cannot open a transaction, so identity rides on the JWT and
        // PostgREST populates request.jwt.claims for RLS instead.
        const token = await resolveAccessToken(config);
        return fn(await supabaseDb(db.supabase ?? {}, token));
    }
    const userId = await resolveUserId(uid);
    const client = await connectToPostgres(config);
    const role = db.authenticatedRole ?? DEFAULT_ROLE;
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { sql } = await import('drizzle-orm');
        return await drizzle(client).transaction(async (transaction) => {
            await transaction.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
            await transaction.execute(sql`set local role ${sql.raw(role)}`);
            return fn(transaction as unknown as DrizzleDb);
        });
    } finally {
        disconnectPostgres(config);
    }
}
```

Update both JSDoc blocks to note that in Supabase mode identity comes from the JWT and each statement is its own transaction.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/context.test.ts`
Expected: PASS — the four new cases plus all pre-existing ones.

- [ ] **Step 5: Create the SQL function users install**

Create `package/supabase/cfni_exec.sql`:

```sql
-- Executes a statement generated by cloudflare-next-intl's `db` module and
-- returns its rows as positional JSON arrays, which is the shape
-- drizzle-orm/pg-proxy maps result columns from.
--
-- SECURITY INVOKER is load-bearing: the statement runs with the privileges of
-- the caller (anon or authenticated, per the request's JWT), so row-level
-- security still applies exactly as it does over the REST API. Do not change
-- this to SECURITY DEFINER, and do not add a role parameter — either would
-- turn this into a privilege-escalation primitive.
create or replace function public.cfni_exec(statement text, params jsonb default '[]'::jsonb)
returns json
language plpgsql
security invoker
as $$
declare
    result json;
    args text[];
begin
    select coalesce(array_agg(value #>> '{}' order by ordinality), '{}')
      into args
      from jsonb_array_elements(params) with ordinality as t(value, ordinality);

    execute format('select coalesce(json_agg(json_build_array(r.*)), ''[]''::json) from (%s) r', statement)
       into result
      using args;

    return result;
end;
$$;

revoke all on function public.cfni_exec(text, jsonb) from public;
grant execute on function public.cfni_exec(text, jsonb) to authenticated;
-- Grant to anon only if your app calls withPublicDb:
grant execute on function public.cfni_exec(text, jsonb) to anon;
```

Add `"supabase"` to the `files` array in `package/package.json` so the SQL ships with the package.

- [ ] **Step 6: Verify the whole suite, types, lint, and build**

```bash
npx vitest run
npx tsc -p tsconfig.build.json --noEmit
npx eslint src/db --max-warnings=0
npm run build
```

Expected: all pass, 0 failures; existing 680 tests plus the new ones. If per-file coverage drops below 100 on any new file, add the missing branch case before continuing.

- [ ] **Step 7: Commit**

```bash
git add package/src/db/context.ts package/src/db/context.test.ts package/supabase/cfni_exec.sql package/package.json package/dist
git commit -m "feat(db): route withPublicDb/withUserDb over supabase when configured"
```

---

### Task 7: Documentation

**Files:**
- Modify: `package/README.md` (the `### Database (db)` section)
- Modify: `package/src/db/index.ts` (module JSDoc)
- Modify: `package/llms.txt`

- [ ] **Step 1: Document both modes in the README**

After the existing `db` fields list, insert:

````markdown
#### Choosing a transport

`db` reaches Postgres one of two ways, decided by which fields you set. The
query code is identical either way — switching is a config change only.

| Config | Transport | Use when |
|---|---|---|
| `connectionString` or `hyperdriveBinding` | Direct Postgres via `pg` | You have a Postgres password or a Hyperdrive binding. |
| `supabase` | Supabase Data API (PostgREST) | You only have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |

A direct connection always wins if both are configured, so adding a `supabase`
block cannot silently reroute live traffic.

```typescript
export default setIntlConfig({
    locales: ["en", "uk"] as const,
    defaultLocale: "en",
    // reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
    db: { supabase: {} },
});
```

```typescript
// unchanged in both modes
const rows = await withPublicDb((db) => db.select().from(bonds).limit(10));
```

Supabase mode requires one function in your database, shipped at
`node_modules/cloudflare-next-intl/supabase/cfni_exec.sql`. Run it once (via
`supabase db push`, a migration, or the SQL editor). It is `security invoker`,
so statements execute with the caller's own privileges and RLS applies exactly
as it does over the REST API.

`db.supabase` fields (all optional):

- `url` — project URL. Defaults to `NEXT_PUBLIC_SUPABASE_URL`.
- `anonKey` — anon/publishable key. Defaults to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Never put a service-role key here.
- `execFunction` — name of the exec function. Defaults to `'cfni_exec'`.

`db.getAccessToken` resolves the JWT `withUserDb` sends as
`Authorization: Bearer`, which is what makes PostgREST resolve the caller as
`authenticated`. Omit it when `firebaseAuth` is configured — the signed-in
user's Firebase ID token is used automatically.

**Two differences to know about in Supabase mode:**

- **Per-statement transactions.** Each statement in a `withUserDb` callback is
  its own round-trip, so it is its own implicit transaction. Multi-statement
  atomicity is available in connection-string mode only.
- **Wider SQL surface.** `cfni_exec` runs statements your app generates, so any
  role that can execute it can run arbitrary SQL *within that role's own
  privileges* — a broader surface than PostgREST's normal verbs, though still
  bounded by RLS and your grants. If your app only uses `withUserDb`, drop the
  anon grant: `revoke execute on function public.cfni_exec(text, jsonb) from anon;`
````

Also update the `**Database**` feature bullet near the top of the README to
mention both transports.

- [ ] **Step 2: Update the `db/index.ts` module doc**

Extend the existing module JSDoc with a sentence naming both transports and
pointing at `resolveDbMode`'s precedence rule, so an agent reading only this
file learns that two backends exist.

- [ ] **Step 3: Mirror the changes in `llms.txt`**

Update the `db` entry to list the `supabase` config block, `getAccessToken`, and
the two caveats above, matching the file's existing terse style.

- [ ] **Step 4: Verify docs match the code**

```bash
grep -n "supabase" package/README.md package/llms.txt package/src/db/index.ts
npx vitest run
```

Expected: every documented field name exists in `SupabaseDbConfig`; suite green.

- [ ] **Step 5: Commit**

```bash
git add package/README.md package/llms.txt package/src/db/index.ts package/dist
git commit -m "docs(db): document the supabase transport and its two caveats"
```

---

## Self-Review

**Spec coverage.** Only-two-secrets → Task 3 (env fallback, no password field anywhere) and the `cfni_exec.sql` design in Task 6 Step 5. Identical call sites → Task 6, which changes neither exported signature and is asserted by the reused `context.test.ts` suites. Server-only → no client entry point or `@supabase/ssr` anywhere. Client/server split from the reference files → intentionally out of scope per the user's answer; the server-side `accessToken` pattern is carried by Task 4. `@supabase/supabase-js` mirrors the reference implementation's `createClient`/`accessToken` pattern → Task 5. Lazy loading → `pg-proxy` is behind `await import()` in Task 6's `supabaseDb`, and `@supabase/supabase-js` is behind `await import()` inside Task 5's `getClient`, so neither bundles for an app that never calls a `db` export; `drizzle-orm/pg-proxy` is a subpath of the already-present `drizzle-orm`.

**Type consistency.** `DbMode`, `SupabaseDbConfig`, `ResolvedSupabaseEndpoint`, and `SupabaseRemoteCallback` are each defined once and used with the same names downstream. `resolveSupabaseEndpoint` is consumed in both Task 5 and Task 6 with the same `(SupabaseDbConfig)` signature. `DrizzleDb` stays `NodePgDatabase<Record<string, never>>`; the `pg-proxy` handle is cast to it, matching the cast the file already uses for the `node-postgres` handle, so the public type does not change.

**Known risks to verify during execution, not assumed away.**
1. `json_build_array(r.*)` relies on Postgres expanding `r.*` into separate arguments. Verify against a real Supabase project before Task 7; if it does not expand, switch to `select coalesce(json_agg(v), '[]') from (…) r, json_build_array(r.*) v` or build the array from `row_to_json`'s values in column order.
2. Parameter typing: `args text[]` passes every `$n` as text and relies on Postgres coercing at the use site. Casts may be needed for some column types. Confirm with an integration check covering an integer filter and a timestamp filter, and record the outcome in the README if a cast is required.
3. Sending a Firebase ID token as the PostgREST bearer only resolves `authenticated` when the Supabase project trusts that issuer (third-party auth configured). The reference project already does this; the README should state it as a prerequisite for `withUserDb`.
