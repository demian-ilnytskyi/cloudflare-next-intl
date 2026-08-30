import resolveConfigValue from './resolve_config_value.js';
export default async function resolveDbMode(db) {
    const connectionString = await resolveConfigValue(db.connectionString);
    if (connectionString)
        return { mode: 'postgres', connectionString };
    if (db.supabase)
        return { mode: 'supabase', supabase: db.supabase };
    return { mode: 'postgres', connectionString: undefined };
}
