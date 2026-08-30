import type { SupabaseDbConfig } from '../types/types.js';
export interface SupabaseRpcError {
    message: string;
    code?: string;
}
export interface ExecResult {
    rows: unknown[];
    rowCount: number | null;
}
export declare function parseExecResult(data: unknown): ExecResult;
export type SupabaseRemoteCallback = (sql: string, params: unknown[], method: 'all' | 'execute') => Promise<{
    rows: unknown[];
    rowCount?: number | null;
}>;
export default function createSupabaseTransport(supabase: SupabaseDbConfig, bearerToken: string): SupabaseRemoteCallback;
export declare function describeFailure(error: SupabaseRpcError, execFunction: string): string;
