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
 * Parameters are inlined into the statement as Postgres literals (see
 * {@link inlineParams}) before it is sent, rather than passed through to
 * `cfni_exec` for binding — `EXECUTE ... USING` can only bind a single
 * uniformly-typed value, which breaks for anything beyond one string param.
 * Inlining keeps every value's real type inferable by Postgres, the same way
 * a direct `pg` connection would send it.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken Token resolved as the caller's identity — the anon key,
 * or a per-request user JWT.
 * @returns A callback suitable for `drizzle-orm/pg-proxy`'s `drizzle()`.
 */
export default function createSupabaseTransport(supabase: SupabaseDbConfig, bearerToken: string): SupabaseRemoteCallback;
