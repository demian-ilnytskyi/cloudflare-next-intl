import type { SupabaseDbConfig } from '../types/types.js';
import { type ExecResult } from './supabase_transport.js';
export interface BatchQuery {
    sql: string;
    params: unknown[];
}
export default function runTransactionBatch(supabase: SupabaseDbConfig, bearerToken: string, queries: BatchQuery[]): Promise<ExecResult[]>;
