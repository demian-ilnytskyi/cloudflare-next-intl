import type { SupabaseDbConfig } from '../types/types';

/** The Supabase project URL and anon key the transport builds a client from. */
export interface ResolvedSupabaseEndpoint {
    /** Project URL, trailing slashes stripped. */
    url: string;
    /** Anon key, sent as both `apikey` and the public-mode bearer token. */
    anonKey: string;
}

/**
 * Resolves the Supabase project URL and anon key, preferring explicit config
 * over the `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * environment variables.
 *
 * @param supabase The `db.supabase` config block.
 * @returns The project URL and anon key to build a Supabase client from.
 * @throws If neither config nor environment supplies a URL or an anon key.
 */
export default function resolveSupabaseEndpoint(supabase: SupabaseDbConfig): ResolvedSupabaseEndpoint {
    const url = supabase.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
        throw new Error(
            'db: could not resolve a Supabase project URL. Set `db.supabase.url` ' +
            'or the NEXT_PUBLIC_SUPABASE_URL environment variable.',
        );
    }
    const anonKey = supabase.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
        throw new Error(
            'db: could not resolve a Supabase anon key. Set `db.supabase.anonKey` ' +
            'or the NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.',
        );
    }
    return { url: url.replace(/\/+$/, ''), anonKey };
}
