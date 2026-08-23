import type { SupabaseDbConfig } from '../types/types';
/**
 * The executor shape `drizzle-orm/pg-proxy` calls with each generated
 * statement. Declared structurally so this file never imports `drizzle-orm`.
 */
export type SupabaseRemoteCallback = (sql: string, params: unknown[], method: 'all' | 'execute') => Promise<{
    rows: unknown[];
    rowCount?: number | null;
}>;
/**
 * Builds the transport Drizzle uses in Supabase mode: every generated
 * statement is first translated into `@supabase/supabase-js` `.from()` calls;
 * anything PostgREST cannot express falls back to `cfni_exec`, and if
 * `db.supabase.rawSql` is `false` the call throws naming the construct that
 * needs raw SQL.
 *
 * `bearerToken` decides who Postgres thinks is calling — the anon key for
 * public reads, a user's JWT for `withUserDb` — delivered through the
 * client's `accessToken` option (the same mechanism a signed-in Supabase
 * session would use), so RLS is enforced by the database rather than by
 * anything in this package. The client is created once and reused for every
 * statement this transport is asked to run.
 *
 * Rows come back as positional arrays because `pg-proxy` maps result columns
 * by index.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken Token resolved as the caller's identity — the anon key,
 * or a per-request user JWT.
 * @returns A callback suitable for `drizzle-orm/pg-proxy`'s `drizzle()`.
 */
export default function createSupabaseTransport(supabase: SupabaseDbConfig, bearerToken: string): SupabaseRemoteCallback;
