import type { SupabaseDbConfig } from '../types/types';
import createRestClient from './rest_client';
import inlineParams from './inline_params';
import { parseExecResult, describeFailure, type ExecResult, type SupabaseRpcError } from './supabase_transport';

/**
 * Fixed, unlike `cfni_exec`'s `execFunction` — `cfni_exec_batch` ships in the
 * same `supabase/cfni_exec.sql` file and is always available whenever
 * `cfni_exec` is (there is no separate config for it; `rawSql: false` turns
 * off both, checked by `context.ts` before this is ever called).
 */
const BATCH_FUNCTION = 'cfni_exec_batch';

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
export default async function runTransactionBatch(
    supabase: SupabaseDbConfig,
    bearerToken: string,
    queries: BatchQuery[],
): Promise<ExecResult[]> {
    const getClient = createRestClient(supabase, bearerToken);
    const client = await getClient();

    const statements = queries.map((query) => inlineParams(query.sql, query.params));
    const { data, error } = await client.rpc(BATCH_FUNCTION, { statements });
    if (error) throw new Error(describeFailure(error as SupabaseRpcError, BATCH_FUNCTION));

    if (!Array.isArray(data)) {
        throw new Error(`db: ${BATCH_FUNCTION} returned a non-array result — is it installed from the version of supabase/cfni_exec.sql shipped with this package?`);
    }
    return data.map(parseExecResult);
}
