# Database Access — `package/src/db/**`

Companion files: [structure.md](structure.md), [package-authoring.md](package-authoring.md).

## Public Surface

- Entry point: `cloudflare-next-intl/db`
- Exports: `withPublicDb`, `withUserDb`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`, and types `DrizzleDb`, `DbRoutingConfig`.
- Helper subpaths: `cloudflare-next-intl/dbHelpers` (Drizzle SQL utils), `cloudflare-next-intl/dbSchema` (table builders), `cloudflare-next-intl/dbEslint` (flat config banning raw driver imports).

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

- `.transaction()` throws in Supabase mode: each statement is an independent PostgREST HTTP round-trip without a shared session. Multi-statement transactions require direct Postgres connection mode (`db.connectionString`).
