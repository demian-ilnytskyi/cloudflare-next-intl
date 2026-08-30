import createRestClient from './rest_client.js';
import parseStatement from './parse_statement.js';
import executeRest from './rest_execute.js';
import UnsupportedSqlError from './unsupported_sql.js';
import inlineParams from './inline_params.js';
import parseComposite from './parse_composite.js';
const DEFAULT_EXEC_FUNCTION = 'cfni_exec';
export function parseExecResult(data) {
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
export default function createSupabaseTransport(supabase, bearerToken) {
    const execFunction = supabase.execFunction ?? DEFAULT_EXEC_FUNCTION;
    const getClient = createRestClient(supabase, bearerToken);
    return async (sql, params) => {
        const client = await getClient();
        try {
            return await executeRest(client, parseStatement(sql), params);
        }
        catch (error) {
            if (!(error instanceof UnsupportedSqlError))
                throw error;
            if (supabase.rawSql === false)
                throw new Error(unsupportedMessage(error, execFunction));
            return runExec(client, sql, params, execFunction);
        }
    };
}
async function runExec(client, sql, params, execFunction) {
    const statement = inlineParams(sql, params);
    const { data, error } = await client.rpc(execFunction, { statement });
    if (error)
        throw new Error(describeFailure(error, execFunction));
    return parseExecResult(data);
}
function unsupportedMessage(error, execFunction) {
    return (`${error.message} \`db.supabase.rawSql\` is \`false\`, so it cannot fall back to raw SQL either. ` +
        `Install the ${execFunction} function from supabase/cfni_exec.sql and drop \`rawSql: false\`, ` +
        'or use `db.connectionString` for a direct Postgres connection.');
}
export function describeFailure(error, execFunction) {
    if (error.code === 'PGRST202') {
        return `db: Supabase rejected the query — ${error.message}. Install the ${execFunction} function from supabase/cfni_exec.sql in your database.`;
    }
    if (error.code === 'PGRST301' || error.code === '42501') {
        return (`db: Supabase rejected the query — ${error.message}. If you are using a Firebase ` +
            'ID token as the bearer token, make sure Supabase third-party (Firebase) auth is ' +
            'configured for this project, or provide `db.getAccessToken` to resolve a Supabase-issued JWT.');
    }
    return `db: Supabase rejected the query — ${error.message}.`;
}
