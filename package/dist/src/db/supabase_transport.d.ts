import type { SupabaseDbConfig } from '../types/types.js';
export interface SupabaseRpcError {
    message: string;
    code?: string;
}
export interface ExecResult {
    rows: unknown[];
    rowCount: number | null;
}
/**
 * `cfni_exec` returns each row as a Postgres composite-literal string (see
 * {@link parseComposite}), so the JSON-decoded `data.rows` array here is a
 * `string[]`, not already the `(string | null)[][]` `pg-proxy` expects —
 * that positional-array shape is what this reconstructs.
 *
 * Exported for {@link ../transaction_batch}, which decodes each element of
 * `cfni_exec_batch`'s result array the same way this decodes a single
 * `cfni_exec` result — the two functions return one `{rows, rowCount}` shape
 * per statement either way.
 */
export declare function parseExecResult(data: unknown): ExecResult;
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
/**
 * Exported for {@link ../transaction_batch}, which reports `cfni_exec_batch`
 * RPC failures the same way this reports `cfni_exec` failures.
 */
export declare function describeFailure(error: SupabaseRpcError, execFunction: string): string;
