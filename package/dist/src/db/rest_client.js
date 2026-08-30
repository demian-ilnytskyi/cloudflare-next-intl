import resolveSupabaseEndpoint from './supabase_config.js';
export default function createRestClient(supabase, bearerToken) {
    let clientPromise = null;
    return () => {
        clientPromise ?? (clientPromise = (async () => {
            const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
            const { createClient } = await import('@supabase/supabase-js');
            return createClient(url, anonKey, { accessToken: async () => bearerToken });
        })());
        return clientPromise;
    };
}
