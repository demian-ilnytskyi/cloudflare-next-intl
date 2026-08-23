import resolveSupabaseEndpoint from './supabase_config';
/**
 * Builds a memoized accessor for the `@supabase/supabase-js` client used by
 * both the REST translator and the `cfni_exec` fallback.
 *
 * `bearerToken` is delivered through the client's `accessToken` option — the
 * same mechanism a signed-in Supabase session uses — so identity and RLS are
 * decided by Postgres, not by this package. The client is created lazily on
 * first use so importing the db module never pulls `@supabase/supabase-js`
 * into a bundle that does not query.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken The anon key, or a per-request user JWT.
 * @returns A thunk resolving to the shared client.
 */
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
