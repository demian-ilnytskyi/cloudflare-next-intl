import type { SupabaseDbConfig } from '../types/types.js';
export interface ResolvedSupabaseEndpoint {
    url: string;
    anonKey: string;
}
export default function resolveSupabaseEndpoint(supabase: SupabaseDbConfig): Promise<ResolvedSupabaseEndpoint>;
