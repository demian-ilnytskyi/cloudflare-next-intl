import type { DbRoutingConfig, SupabaseDbConfig } from '../types/types.js';
export type DbMode = 'postgres' | 'supabase';
export type ResolvedDbMode = {
    mode: 'postgres';
    connectionString: string | undefined;
} | {
    mode: 'supabase';
    supabase: SupabaseDbConfig;
};
export default function resolveDbMode(db: DbRoutingConfig): Promise<ResolvedDbMode>;
