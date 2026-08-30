import resolveConfigValue from './resolve_config_value.js';
export default async function resolveSupabaseEndpoint(supabase) {
    const url = (await resolveConfigValue(supabase.url)) ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
        throw new Error('db: could not resolve a Supabase project URL. Set `db.supabase.url` ' +
            'or the NEXT_PUBLIC_SUPABASE_URL environment variable.');
    }
    const anonKey = (await resolveConfigValue(supabase.anonKey)) ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
        throw new Error('db: could not resolve a Supabase anon key. Set `db.supabase.anonKey` ' +
            'or the NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.');
    }
    return { url: url.replace(/\/+$/, ''), anonKey };
}
