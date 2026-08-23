/**
 * Optional Postgres/Drizzle data-access layer, reached from
 * `cloudflare-next-intl/db`. Enable it by setting `db` on your `RoutingConfig`;
 * every export here throws a descriptive error if that config is missing.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * Two transports reach Postgres behind that same Drizzle query API, chosen by
 * `resolveDbMode` from which `db` config fields are set: `connectionString`
 * for a direct connection (wins if both are configured), or `supabase` for
 * the Supabase Data API when only a project URL and anon key are available. `pg`, `drizzle-orm`, and `@supabase/supabase-js` all
 * load through dynamic `import()` inside these functions, so an app that
 * never calls a `db` export never bundles any of them.
 *
 * When `db.supabase.rawSql` is `false` (or `cfni_exec` can't be installed),
 * `withPublicDb`/`withUserDb` throw instead of running in Supabase mode; use
 * `supabaseSelect`/`supabaseInsert`/`supabaseUpsert`/`supabaseUpdate`/
 * `supabaseDelete`/`supabaseRpc` (and their `*AsUser` counterparts) instead —
 * they call `@supabase/supabase-js`'s `.from()`/`.rpc()` API directly, no
 * `cfni_exec`, no raw SQL, only what PostgREST's REST API itself supports.
 *
 * Generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …) live in
 * the separate `cloudflare-next-intl/dbHelpers` entry point.
 */
export { withPublicDb, withUserDb } from './context';
export type { DrizzleDb } from './context';
export { default as connectToPostgres, disconnectPostgres, resetConnectionState } from './connection';
export type { DbRoutingConfig } from '../types/types';
export { supabaseSelect, supabaseSelectAsUser, supabaseInsert, supabaseInsertAsUser, supabaseUpsert, supabaseUpsertAsUser, supabaseUpdate, supabaseUpdateAsUser, supabaseDelete, supabaseDeleteAsUser, supabaseRpc, supabaseRpcAsUser, } from './supabase_rest';
export type { SupabaseWhere, SupabaseFilterOperator, SupabaseFilterValue, SupabaseOrderBy, SupabaseTextSearch, SupabaseSelectOptions, SupabaseMutationOptions, SupabaseUpsertOptions, SupabaseResult, } from './supabase_rest';
