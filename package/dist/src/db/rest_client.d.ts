import type { SupabaseDbConfig } from '../types/types';
import type { FilterTarget } from './rest_filters';
/** The object shape `@supabase/postgrest-js` query promises resolve with. */
export interface RestQueryResult<T> {
    data: T | null;
    error: {
        message: string;
        code?: string;
    } | null;
    count: number | null;
}
/**
 * The subset of `@supabase/postgrest-js`'s builder methods this module calls,
 * declared structurally so nothing here imports `@supabase/supabase-js`.
 */
export interface RestQueryBuilder extends FilterTarget {
    select(columns?: string, opts?: {
        count?: 'exact';
        head?: boolean;
    }): RestQueryBuilder;
    insert(values: Record<string, unknown>[]): RestQueryBuilder;
    upsert(values: Record<string, unknown>[], opts?: {
        onConflict?: string;
        ignoreDuplicates?: boolean;
    }): RestQueryBuilder;
    update(values: Record<string, unknown>): RestQueryBuilder;
    delete(): RestQueryBuilder;
    order(column: string, opts?: {
        ascending?: boolean;
        nullsFirst?: boolean;
    }): RestQueryBuilder;
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
export default function createRestClient(supabase: SupabaseDbConfig, bearerToken: string): () => Promise<RestClient>;
