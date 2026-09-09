import { cache } from 'react';
import resolveSupabaseEndpoint from './supabase_config.js';
const getOrCreateClient = cache(async (supabase, bearerToken) => {
    const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey, { accessToken: async () => bearerToken });
});
export default function createRestClient(supabase, bearerToken) {
    let clientPromise = null;
    return () => (clientPromise ?? (clientPromise = getOrCreateClient(supabase, bearerToken)));
}
