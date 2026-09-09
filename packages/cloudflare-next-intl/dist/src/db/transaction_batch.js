import createRestClient from './rest_client.js';
import inlineParams from './inline_params.js';
import { parseExecResult, describeFailure } from './supabase_transport.js';
const BATCH_FUNCTION = 'cfni_exec_batch';
export default async function runTransactionBatch(supabase, bearerToken, queries) {
    const getClient = createRestClient(supabase, bearerToken);
    const client = await getClient();
    const statements = queries.map((query) => inlineParams(query.sql, query.params));
    const { data, error } = await client.rpc(BATCH_FUNCTION, { statements });
    if (error)
        throw new Error(describeFailure(error, BATCH_FUNCTION));
    if (!Array.isArray(data)) {
        throw new Error(`db: ${BATCH_FUNCTION} returned a non-array result — is it installed from the version of supabase/cfni_exec.sql shipped with this package?`);
    }
    return data.map(parseExecResult);
}
