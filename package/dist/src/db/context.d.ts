import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DbRoutingConfig } from '../types/types.js';
export type DrizzleDb = NodePgDatabase<Record<string, never>>;
export declare function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T>;
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null, dbOverride?: DbRoutingConfig): Promise<T>;
export type { ExecResult as TransactionResult } from './supabase_transport.js';
