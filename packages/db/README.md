# cloudflare-next-intl-db

Framework-agnostic Postgres/Drizzle/Supabase data-access layer. Extracted
from `cloudflare-next-intl`'s `db` module so it can run anywhere plain
TypeScript runs — Deno (Supabase Edge Functions), Node, Cloudflare Workers,
Firebase Functions — with **no** dependency on React, Next.js, or Firebase
Auth. `cloudflare-next-intl`'s own `./db` subpath re-exports this package
and layers its own `@intl-config`/Firebase Auth convenience on top; use
this package directly when you have neither.

## Subpaths

- `cloudflare-next-intl-db` — `withPublicDb`, `withUserDb`, `withServiceDb`, `withDbClient`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`.
- `cloudflare-next-intl-db/helpers` — generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …).
- `cloudflare-next-intl-db/schema` — table builders.
- `cloudflare-next-intl-db/testing` — `makeFakeDb` test double, no real Postgres connection needed.
- `cloudflare-next-intl-db/eslint` — flat-config fragment banning raw driver imports.

See the parent package's `db.md` (`.agent/.sub-rules/packages/db.md`) for
the transport pipeline and supported REST subset — unchanged by this split.

## Codegen CLI moved to `cloudflare-next-intl-db-codegen`

`cfni-db-codegen`/`cfni-db-install-exec` live in the separate
[`cloudflare-next-intl-db-codegen`](../db-codegen/README.md) package as of
`0.2.0`. Their only dependency this runtime package used to force on every
consumer — `embedded-postgres`, which ships real per-platform Postgres
binaries — never belonged in a package meant to run inside an edge function;
it bloated every Deno/Supabase Edge Function bundle that did `npm:
cloudflare-next-intl-db` regardless of whether the function ever touched the
codegen path. Install `cloudflare-next-intl-db-codegen` (or `npx
--package=cloudflare-next-intl-db-codegen`) wherever you used to run
`cfni-db-codegen` from this package.

## Usage outside Next.js — e.g. a Deno Supabase Edge Function

```ts
import { withPublicDb } from "npm:cloudflare-next-intl-db@0.2.3";

const rows = await withPublicDb(
  (db) => db.select().from(articles),
  { db: { supabase: { url: Deno.env.get("SUPABASE_URL"), anonKey: Deno.env.get("SUPABASE_ANON_KEY") } } },
);
```

No `resolveAuthUser` is needed for `withPublicDb`. For `withUserDb`, pass a
`resolveAuthUser` callback backed by whatever your own auth system already
gives you — e.g. decode the caller's own JWT and return `{ uid, getIdToken,
getIdTokenResult }` — or pass an explicit `UserDbCredentials` as `withUserDb`'s
second argument instead and skip `resolveAuthUser` entirely.

## Service role (`withServiceDb`) — bypasses RLS entirely

In Supabase Data API mode, sends `db.supabase.serviceRoleKey` as the sole
bearer token (mirroring how `withPublicDb` sends `anonKey`) — both the
`apikey` header and the Postgres session role become the service role's for
the whole call, so every RLS policy on every table it touches is bypassed.

```ts
import { withServiceDb } from "npm:cloudflare-next-intl-db@0.2.3";

const allProfiles = await withServiceDb(
  (db) => db.select().from(profiles),
  {
    db: {
      supabase: {
        url: Deno.env.get("SUPABASE_URL"),
        anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
        serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      },
    },
  },
);
```

In connection-string mode, `withServiceDb` runs on the connection exactly
as configured — it skips the `set local role anon`/`authenticated`
downgrade `withPublicDb`/`withUserDb` apply, but grants no privilege on its
own: `db.connectionString` itself must already point at a role that can see
what you're asking for (a service-role/superuser DSN, or one Postgres lets
bypass RLS) for this to actually return everything.

```ts
const allProfiles = await withServiceDb(
  (db) => db.select().from(profiles),
  { db: { connectionString: process.env.SERVICE_ROLE_DATABASE_URL } },
);
```

**Treat `serviceRoleKey`/a privileged `connectionString` like any other
server-only secret.** Never wire either to anything a request/user can
influence, never log it, never send it to a client. Reach for
`withServiceDb` only in genuinely privileged, trusted-code paths — an admin
action, a cron job, a webhook handler — not as a shortcut around
`withUserDb`/RLS for an ordinary request.

Every handle `withPublicDb`/`withUserDb`/`withServiceDb` pass to your
callback also carries a plain `isServiceRole` boolean (`true` only for
`withServiceDb`) for code shared across wrappers that needs to branch on
which one is currently running:

```ts
function readRow(db: DrizzleDb) {
  if ((db as unknown as { isServiceRole: boolean }).isServiceRole) {
    // privileged path
  }
}
```
