import { cache } from 'react';
import resolveConfigValue from './resolve_config_value.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';
async function resolveDbModeUncached(db, generate) {
    const connectionString = await resolveConfigValue(db.connectionString);
    if (connectionString)
        return { mode: 'postgres', connectionString };
    if (db.autoHyperdrive !== false) {
        const hyperdriveConnectionString = await resolveHyperdriveConnectionString(generate, db.autoHyperdriveSkipUrls);
        if (hyperdriveConnectionString)
            return { mode: 'postgres', connectionString: hyperdriveConnectionString };
    }
    if (db.supabase)
        return { mode: 'supabase', supabase: db.supabase };
    return { mode: 'postgres', connectionString: undefined };
}
const resolveDbMode = cache(resolveDbModeUncached);
export default resolveDbMode;
