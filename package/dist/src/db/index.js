/**
 * Optional Postgres/Drizzle data-access layer, reached from
 * `cloudflare-next-intl/db`. Enable it by setting `db` on your `RoutingConfig`;
 * every export here throws a descriptive error if that config is missing.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * Need more than one statement to succeed or fail together?
 * - {@link withPublicTransaction} / {@link withUserTransaction} — build
 *   queries with `.toSQL()` instead of executing them; every statement then
 *   runs atomically, whichever transport mode is active.
 *
 * Two transports reach Postgres behind that same Drizzle query API, chosen by
 * `resolveDbMode` from which `db` config fields are set: `connectionString`
 * for a direct connection (wins if both are configured), or `supabase` for
 * the Supabase Data API when only a project URL and anon key are available. `pg`, `drizzle-orm`, and `@supabase/supabase-js` all
 * load through dynamic `import()` inside these functions, so an app that
 * never calls a `db` export never bundles any of them.
 *
 * You write the same Drizzle code either way. In Supabase mode each generated
 * statement is first translated into `@supabase/supabase-js` `.from()` calls;
 * anything PostgREST cannot express falls back to `cfni_exec`, and if
 * `db.supabase.rawSql` is `false` the call throws naming the construct that
 * needs raw SQL. `withPublicDb`/`withUserDb`'s `.transaction()` is never
 * available in Supabase mode — reach for `withPublicTransaction`/
 * `withUserTransaction` there instead.
 *
 * Generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …) live in
 * the separate `cloudflare-next-intl/dbHelpers` entry point.
 */
export { withPublicDb, withUserDb, withPublicTransaction, withUserTransaction } from './context';
export { default as connectToPostgres, disconnectPostgres, resetConnectionState } from './connection';
