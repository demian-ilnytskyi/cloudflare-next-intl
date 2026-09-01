import { cache } from 'react';
import type { SupabaseDbConfig } from '../types/types.js';
import type { FilterTarget } from './rest_filters.js';
import resolveSupabaseEndpoint from './supabase_config.js';

/** The object shape `@supabase/postgrest-js` query promises resolve with. */
export interface RestQueryResult<T> {
    data: T | null;
    error: { message: string; code?: string } | null;
    count: number | null;
}

/**
 * The subset of `@supabase/postgrest-js`'s builder methods this module calls,
 * declared structurally so nothing here imports `@supabase/supabase-js`.
 */
export interface RestQueryBuilder extends FilterTarget {
    select(columns?: string, opts?: { count?: 'exact'; head?: boolean }): RestQueryBuilder;
    insert(values: Record<string, unknown>[]): RestQueryBuilder;
    upsert(values: Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): RestQueryBuilder;
    update(values: Record<string, unknown>): RestQueryBuilder;
    delete(): RestQueryBuilder;
    order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): RestQueryBuilder;
    limit(count: number): RestQueryBuilder;
    range(from: number, to: number): RestQueryBuilder;
    then<T>(onfulfilled?: (value: RestQueryResult<T>) => unknown): Promise<unknown>;
}

/**
 * Minimal structural type for the `@supabase/supabase-js` client this package
 * creates via dynamic import.
 */
export interface RestClient {
    from(table: string): RestQueryBuilder;
    rpc(fn: string, args?: Record<string, unknown>): Promise<RestQueryResult<unknown>>;
}

/**
 * Builds (or, per request, reuses) the `@supabase/supabase-js` client used by
 * both the REST translator and the `cfni_exec` fallback.
 *
 * `bearerToken` is delivered through the client's `accessToken` option — the
 * same mechanism a signed-in Supabase session uses — so identity and RLS are
 * decided by Postgres, not by this package. The client is created lazily on
 * first use so importing the db module never pulls `@supabase/supabase-js`
 * into a bundle that does not query.
 *
 * Memoized per request with React's `cache()`, keyed on `(supabase,
 * bearerToken)`. `withUserDb`/`withPublicDb` build a fresh
 * `createRestClient` closure on every call, so the closure-local memoization
 * this used to rely on never actually spanned more than one DB call — a page
 * with 6+ DB-backed sections for the same signed-in user was constructing 6+
 * separate clients (each its own dynamic `import('@supabase/supabase-js')` +
 * `createClient()`) for what should be one shared client. Keying on
 * `bearerToken` (not just `supabase`) keeps two different users' requests
 * from ever sharing a client — `cache()` is already request-scoped, so this
 * can't leak across requests either.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken The anon key, or a per-request user JWT.
 * @returns A thunk resolving to the shared client.
 */
const getOrCreateClient = cache(async (supabase: SupabaseDbConfig, bearerToken: string): Promise<RestClient> => {
    const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey, { accessToken: async () => bearerToken }) as unknown as RestClient;
});

export default function createRestClient(supabase: SupabaseDbConfig, bearerToken: string): () => Promise<RestClient> {
    // A closure-local memo on top of the cache() call above: `cache()` only
    // dedupes inside an active React render, so outside one (a plain script,
    // a test) it re-runs the function on every call — this keeps a single
    // `createRestClient(...)` result idempotent regardless of that, which is
    // the contract callers here rely on.
    let clientPromise: Promise<RestClient> | null = null;
    return () => (clientPromise ??= getOrCreateClient(supabase, bearerToken));
}
