import resolveSupabaseEndpoint from './supabase_config';
import inlineParams from './inline_params';
import parseComposite from './parse_composite';
const DEFAULT_EXEC_FUNCTION = 'cfni_exec';
/**
 * `cfni_exec` returns each row as a Postgres composite-literal string (see
 * {@link parseComposite}), so the JSON-decoded `data.rows` array here is a
 * `string[]`, not already the `(string | null)[][]` `pg-proxy` expects —
 * that positional-array shape is what this reconstructs.
 */
function parseExecResult(data) {
    if (Array.isArray(data))
        return { rows: data.map(parseRow), rowCount: null };
    if (data && typeof data === 'object' && 'rows' in data) {
        const { rows, rowCount } = data;
        return {
            rows: Array.isArray(rows) ? rows.map(parseRow) : [],
            rowCount: typeof rowCount === 'number' ? rowCount : null,
        };
    }
    return { rows: [], rowCount: null };
}
function parseRow(row) {
    return typeof row === 'string' ? parseComposite(row) : row;
}
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
export default function createSupabaseTransport(supabase, bearerToken) {
    const execFunction = supabase.execFunction ?? DEFAULT_EXEC_FUNCTION;
    let clientPromise = null;
    async function getClient() {
        clientPromise ?? (clientPromise = (async () => {
            const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
            const { createClient } = await import('@supabase/supabase-js');
            return createClient(url, anonKey, { accessToken: async () => bearerToken });
        })());
        return clientPromise;
    }
    return async (sql, params) => {
        const client = await getClient();
        const statement = inlineParams(sql, params);
        const { data, error } = await client.rpc(execFunction, { statement });
        if (error)
            throw new Error(describeFailure(error, execFunction));
        return parseExecResult(data);
    };
}
function describeFailure(error, execFunction) {
    // PGRST202 is PostgREST's "no such function" — by far the most likely
    // first-run failure, so point at the install step instead of the raw code.
    if (error.code === 'PGRST202') {
        return `db: Supabase rejected the query — ${error.message}. Install the ${execFunction} function from supabase/cfni_exec.sql in your database.`;
    }
    // A 401 here almost always means the bearer token wasn't accepted as a
    // valid JWT by PostgREST — the most common cause is a Firebase ID token
    // reaching a project without Supabase third-party (Firebase) auth set up.
    if (error.code === 'PGRST301' || error.code === '42501') {
        return (`db: Supabase rejected the query — ${error.message}. If you are using a Firebase ` +
            'ID token as the bearer token, make sure Supabase third-party (Firebase) auth is ' +
            'configured for this project, or provide `db.getAccessToken` to resolve a Supabase-issued JWT.');
    }
    return `db: Supabase rejected the query — ${error.message}.`;
}
