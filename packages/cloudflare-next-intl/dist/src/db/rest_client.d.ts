import type { SupabaseDbConfig } from '../types/types.js';
import type { FilterTarget } from './rest_filters.js';
export interface RestQueryResult<T> {
    data: T | null;
    error: {
        message: string;
        code?: string;
    } | null;
    count: number | null;
}
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
export interface RestClient {
    from(table: string): RestQueryBuilder;
    rpc(fn: string, args?: Record<string, unknown>): Promise<RestQueryResult<unknown>>;
}
export default function createRestClient(supabase: SupabaseDbConfig, bearerToken: string): () => Promise<RestClient>;
