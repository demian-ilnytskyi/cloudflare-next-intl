/**
 * Optional Postgres/Drizzle data-access layer, reached from
 * `cloudflare-next-intl/db`. Enable it by setting `db` on your `RoutingConfig`;
 * every export here throws a descriptive error if that config is missing.
 *
 * Usable outside Next.js too — pass a `db` block directly as the last
 * argument to {@link withPublicDb}/{@link withUserDb} instead of configuring
 * `@intl-config`, e.g. from Firebase Functions or any plain TS project.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * Need more than one statement to succeed or fail together? Call
 * `db.transaction(...)` on the handle either wrapper hands your callback —
 * same method name in both transport modes. In connection-string mode it is
 * a real Drizzle transaction: `db.transaction(async (tx) => { await
 * tx.insert(...); await tx.update(...); })`, and a later statement may use an
 * earlier one's result. In Supabase mode there is no session to run that
 * over, so the callback instead *builds* queries and returns them —
 * `db.transaction((tx) => [tx.insert(...).values(...).toSQL(), tx.update(...).toSQL()])`
 * — call `.toSQL()` on each instead of `await`ing it; every statement then
 * runs atomically as one `cfni_exec_batch` call, but a later statement cannot
 * read an earlier one's result there.
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
 * needs raw SQL — including `.transaction()`, which needs `cfni_exec_batch`
 * from the same file.
 *
 * Generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …) live in
 * the separate `cloudflare-next-intl/dbHelpers` entry point.
 */
export { withPublicDb, withUserDb, resolveUserDbCredentials } from './context.js';
export type { UserDbCredentials } from './context.js';
export type { DrizzleDb, TransactionResult } from './context.js';
export { withDbClient, connectToPostgres, disconnectPostgres, resetConnectionState } from './connection.js';
export type { DbRoutingConfig } from '../types/types.js';
