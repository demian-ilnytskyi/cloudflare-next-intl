import type { SupabaseDbConfig } from '../types/types';
import { type ExecResult } from './supabase_transport';
/** One statement to run inside a batch: Drizzle's `.toSQL()` output. */
export interface BatchQuery {
    sql: string;
    params: unknown[];
}
/**
 * Sends every query in `queries` to `cfni_exec_batch` as one PostgREST round
 * trip. The Postgres function runs them in order inside a single plpgsql
 * call — itself an implicit transaction — so a failure on any statement
 * rolls back every statement that ran before it in the same batch, giving
 * Supabase-mode callers the atomicity `.transaction()` cannot provide there
 * (see `context.ts`'s `supabaseDb`).
 *
 * Each query is rendered with {@link inlineParams} exactly like a normal
 * `cfni_exec` call, since `cfni_exec_batch` takes pre-rendered statement
 * text the same way `cfni_exec` does — neither function binds parameters
 * itself.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken Token resolved as the caller's identity — the anon key
 * for `withPublicDb`'s handle, a user JWT for `withUserDb`'s — see
 * `context.ts`'s `runTransaction`, which backs both handles' `.transaction()`.
 * @param queries The statements to run, in order. An empty array is a no-op
 * that still makes the round trip, matching `cfni_exec_batch(array[]::text[])`.
 * @returns One `{rows, rowCount}` result per query, in the same order.
 * @throws If the batch RPC itself fails to reach Postgres, or if any
 * statement in the batch fails — the whole batch is rolled back either way.
 */
export default function runTransactionBatch(supabase: SupabaseDbConfig, bearerToken: string, queries: BatchQuery[]): Promise<ExecResult[]>;
