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
