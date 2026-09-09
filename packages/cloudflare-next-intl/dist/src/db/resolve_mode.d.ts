import type { DbRoutingConfig, GenerateRoutingConfig, SupabaseDbConfig } from '../types/types.js';
export type DbMode = 'postgres' | 'supabase';
export type ResolvedDbMode = {
    mode: 'postgres';
    connectionString: string | undefined;
} | {
    mode: 'supabase';
    supabase: SupabaseDbConfig;
};
declare function resolveDbModeUncached(db: DbRoutingConfig, generate?: GenerateRoutingConfig): Promise<ResolvedDbMode>;
declare const resolveDbMode: typeof resolveDbModeUncached;
export default resolveDbMode;
