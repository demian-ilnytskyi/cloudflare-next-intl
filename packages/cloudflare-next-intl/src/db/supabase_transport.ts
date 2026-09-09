import type { SupabaseDbConfig } from '../types/types.js';
import createRestClient, { type RestClient } from './rest_client.js';
import parseStatement from './parse_statement.js';
import executeRest from './rest_execute.js';
import UnsupportedSqlError from './unsupported_sql.js';
import inlineParams from './inline_params.js';
import parseComposite from './parse_composite.js';

const DEFAULT_EXEC_FUNCTION = 'cfni_exec';

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
export function parseExecResult(data: unknown): ExecResult {
    if (Array.isArray(data)) return { rows: data.map(parseRow), rowCount: null };
    if (data && typeof data === 'object' && 'rows' in data) {
        const { rows, rowCount } = data as { rows: unknown; rowCount?: unknown };
        return {
            rows: Array.isArray(rows) ? rows.map(parseRow) : [],
            rowCount: typeof rowCount === 'number' ? rowCount : null,
        };
    }
    return { rows: [], rowCount: null };
}

function parseRow(row: unknown): unknown {
    return typeof row === 'string' ? parseComposite(row) : row;
}

/**
 * The executor shape `drizzle-orm/pg-proxy` calls with each generated
 * statement. Declared structurally so this file never imports `drizzle-orm`.
 */
export type SupabaseRemoteCallback = (
    sql: string,
    params: unknown[],
    method: 'all' | 'execute',
) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

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
export default function createSupabaseTransport(
    supabase: SupabaseDbConfig,
    bearerToken: string,
): SupabaseRemoteCallback {
    const execFunction = supabase.execFunction ?? DEFAULT_EXEC_FUNCTION;
    const getClient = createRestClient(supabase, bearerToken);

    return async (sql, params) => {
        const client = await getClient();
        try {
            return await executeRest(client, parseStatement(sql), params);
        } catch (error) {
            if (!(error instanceof UnsupportedSqlError)) throw error;
            if (supabase.rawSql === false) throw new Error(unsupportedMessage(error, execFunction));
            return runExec(client, sql, params, execFunction);
        }
    };
}

async function runExec(
    client: RestClient,
    sql: string,
    params: unknown[],
    execFunction: string,
): Promise<ExecResult> {
    const statement = inlineParams(sql, params);
    const { data, error } = await client.rpc(execFunction, { statement });
    if (error) throw new Error(describeFailure(error as SupabaseRpcError, execFunction));
    return parseExecResult(data);
}

function unsupportedMessage(error: UnsupportedSqlError, execFunction: string): string {
    return (
        `${error.message} \`db.supabase.rawSql\` is \`false\`, so it cannot fall back to raw SQL either. ` +
        `Install the ${execFunction} function from supabase/cfni_exec.sql and drop \`rawSql: false\`, ` +
        'or use `db.connectionString` for a direct Postgres connection.'
    );
}

/**
 * Exported for {@link ../transaction_batch}, which reports `cfni_exec_batch`
 * RPC failures the same way this reports `cfni_exec` failures.
 */
export function describeFailure(error: SupabaseRpcError, execFunction: string): string {
    // PGRST202 is PostgREST's "no such function" — by far the most likely
    // first-run failure, so point at the install step instead of the raw code.
    if (error.code === 'PGRST202') {
        return `db: Supabase rejected the query — ${error.message}. Install the ${execFunction} function from supabase/cfni_exec.sql in your database.`;
    }
    // A 401 here almost always means the bearer token wasn't accepted as a
    // valid JWT by PostgREST — the most common cause is a Firebase ID token
    // reaching a project without Supabase third-party (Firebase) auth set up.
    if (error.code === 'PGRST301' || error.code === '42501') {
        return (
            `db: Supabase rejected the query — ${error.message}. If you are using a Firebase ` +
            'ID token as the bearer token, make sure Supabase third-party (Firebase) auth is ' +
            'configured for this project, or provide `db.getAccessToken` to resolve a Supabase-issued JWT.'
        );
    }
    return `db: Supabase rejected the query — ${error.message}.`;
}
