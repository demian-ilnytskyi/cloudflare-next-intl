# Database Access — `packages/db/src/**` (`cloudflare-next-intl-db`)

Companion files: [structure.md](structure.md), [package-authoring.md](package-authoring.md).

Split out of `cloudflare-next-intl` into its own package,
`cloudflare-next-intl-db`, so it can run anywhere plain TypeScript runs
(Deno/Supabase Edge Functions, Node, Cloudflare Workers, Firebase
Functions) with no dependency on React, Next.js, or Firebase Auth.
`packages/cloudflare-next-intl/src/db/**` re-exports this package's
primitives under the same names, layering `@intl-config` auto-resolution
and Firebase Auth wiring on top — both packages expose the identical
wrapper API described below.

## Public Surface

- Entry point: `cloudflare-next-intl-db` (or `cloudflare-next-intl/db` from
  the main package).
- Exports: `withPublicDb`, `withUserDb`, `withServiceDb`,
  `resolveUserDbCredentials`, `withDbClient`, `connectToPostgres`,
  `disconnectPostgres`, `resetConnectionState`, `withSessionLock`, and types
  `DrizzleDb`, `DbConfig`, `DbRoutingConfig`, `SupabaseDbConfig`,
  `TransactionResult`, `UserDbCredentials`, `AuthUserResolverResult`.
- Helper subpaths: `cloudflare-next-intl-db/helpers` (Drizzle SQL utils),
  `cloudflare-next-intl-db/schema` (table builders),
  `cloudflare-next-intl-db/testing` (`makeFakeDb` test double),
  `cloudflare-next-intl-db/eslint` (flat config banning raw driver
  imports).

## Which wrapper

- `withPublicDb` — anonymous role, for data any visitor may read.
- `withUserDb` — the signed-in user, RLS applied to their id (pass an
  explicit `UserDbCredentials` when calling from outside Next.js, e.g. an
  edge function that already has the caller's token off the request —
  never call `resolveUserDbCredentials`/wire a Firebase resolver there,
  that convenience belongs to the main package's Next.js wrapper).
- `withServiceDb` — service role, **bypasses RLS entirely**. In Supabase
  mode, `db.supabase.serviceRoleKey` is sent as the sole bearer token. In
  connection-string mode it skips the `set local role` downgrade
  `withPublicDb`/`withUserDb` apply and runs on the connection exactly as
  configured — grants no privilege on its own, `db.connectionString` must
  already point at a role that can see what's being asked for. Never wire
  `serviceRoleKey`/a privileged `connectionString` to anything a
  request/user can influence — trusted server-side paths only (admin
  actions, cron jobs, webhooks), never a shortcut around `withUserDb`/RLS
  for an ordinary request.
- Every handle these three pass to your callback also carries a plain
  `isServiceRole` boolean (`true` only for `withServiceDb`) — cast to
  `{ isServiceRole: boolean }` in code shared across wrappers that needs to
  branch on which one is running.

## Mode Resolution (`resolveDbMode`)

- `db.connectionString` configured -> Direct Postgres mode (pooled client, per-request disconnect by default).
- `db.supabase` configured (and no `connectionString`) -> Supabase Data API mode.
- Neither configured -> `db` wrappers throw missing config error.

## Supabase Transport Pipeline

1. **`supabase_transport`**: Intercepts Drizzle SQL statements.
2. **`parse_statement`**: Parses SQL into typed AST (`select`, `insert`, `update`, `delete`).
3. **`rest_execute`**: Maps AST to `@supabase/supabase-js` `.from()` PostgREST calls via `rest_filters`.
4. **Fallback to `cfni_exec`**: Any `UnsupportedSqlError` during parse/execute falls back to `cfni_exec` via `.rpc()`.
5. **`rawSql: false`**: If `db.supabase.rawSql === false`, `UnsupportedSqlError` is re-thrown as a descriptive user-facing error instead of falling back to `cfni_exec`.

## Supported REST Subset

- Single-table `SELECT` (projections, lone `count(*)`, WHERE filters, ORDER BY, LIMIT, OFFSET).
- Single-table `INSERT` (multi-row, `ON CONFLICT DO NOTHING / UPDATE`).
- Single-table `UPDATE` and `DELETE` with WHERE filters.
- Positional `RETURNING` projections.
- Supported WHERE operators: `=`, `<>`, `!=`, `>`, `>=`, `<`, `<=`, `like`, `ilike`, `is [not] null`, `[not] in`, `is [not] distinct from`, `~`, `~*`, `@>`, `<@`, `&&`, `>>`, `<<`, `&>`, `&<`, `-|-`, and `@@` text search.
- Unsupported over REST: multi-table joins, CTEs, non-count aggregates (`sum`, `avg`, `min`, `max`), `group by`, `having`, `union`, `select distinct`, raw SQL -> falls back to `cfni_exec`.

## Positional Rows

`drizzle-orm/pg-proxy` maps result columns by index position (`rows: unknown[][]`). Both REST execution and `cfni_exec` decode rows into arrays in exact projection order.

## Transactions

- Call `db.transaction(build)` on the handle any of the three wrappers hand your callback — same method name across all transport modes.
- Connection-string mode: a real Drizzle transaction — `db.transaction(async (tx) => { await tx.insert(...); await tx.update(...); })` — a later statement may use an earlier one's result.
- Supabase mode: there is no session to run that over, so `build` instead *builds* queries and returns them — `db.transaction((tx) => [tx.insert(...).values(...).toSQL(), tx.update(...).toSQL()])` (call `.toSQL()` on each, never `await` them — that throws immediately). Every statement then runs atomically as one `cfni_exec_batch` call — the Postgres function runs every statement inside a single plpgsql call (itself an implicit transaction), so a failure on any statement rolls back everything before it. `cfni_exec_batch` ships alongside `cfni_exec` in `supabase/cfni_exec.sql` and follows the same `db.supabase.rawSql` gate — no separate config. A later statement cannot read an earlier one's result in this mode.
