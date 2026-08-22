import type { SupabaseDbConfig } from '../types/types';
import resolveSupabaseEndpoint from './supabase_config';

const DEFAULT_EXEC_FUNCTION = 'cfni_exec';

interface SupabaseRpcError {
    message: string;
    code?: string;
}

interface SupabaseRpcClient {
    rpc: (fn: string, args: unknown) => Promise<{ data: unknown; error: SupabaseRpcError | null }>;
}

/**
 * The executor shape `drizzle-orm/pg-proxy` calls with each generated
 * statement. Declared structurally so this file never imports `drizzle-orm`.
 */
export type SupabaseRemoteCallback = (
    sql: string,
    params: unknown[],
    method: 'all' | 'execute',
) => Promise<{ rows: unknown[] }>;

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
 * @param supabase The `db.supabase` config block.
 * @param bearerToken Token resolved as the caller's identity — the anon key,
 * or a per-request user JWT.
 * @returns A callback suitable for `drizzle-orm/pg-proxy`'s `drizzle()`.
 */
export default function createSupabaseTransport(
    supabase: SupabaseDbConfig,
    bearerToken: string,
): SupabaseRemoteCallback {
    const { url, anonKey } = resolveSupabaseEndpoint(supabase);
    const execFunction = supabase.execFunction ?? DEFAULT_EXEC_FUNCTION;
    let clientPromise: Promise<SupabaseRpcClient> | null = null;

    async function getClient(): Promise<SupabaseRpcClient> {
        clientPromise ??= (async () => {
            const { createClient } = await import('@supabase/supabase-js');
            return createClient(url, anonKey, { accessToken: async () => bearerToken }) as unknown as SupabaseRpcClient;
        })();
        return clientPromise;
    }

    return async (sql, params) => {
        const client = await getClient();
        const { data, error } = await client.rpc(execFunction, { statement: sql, params });
        if (error) throw new Error(describeFailure(error, execFunction));
        return { rows: Array.isArray(data) ? data : [] };
    };
}

function describeFailure(error: SupabaseRpcError, execFunction: string): string {
    // PGRST202 is PostgREST's "no such function" — by far the most likely
    // first-run failure, so point at the install step instead of the raw code.
    if (error.code === 'PGRST202') {
        return `db: Supabase rejected the query — ${error.message}. Install the ${execFunction} function from supabase/cfni_exec.sql in your database.`;
    }
    return `db: Supabase rejected the query — ${error.message}.`;
}
