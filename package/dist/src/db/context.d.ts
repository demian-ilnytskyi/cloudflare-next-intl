import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
export type DrizzleDb = NodePgDatabase<Record<string, never>>;
/**
 * Runs `fn` against the request's pooled connection with no transaction and no
 * role switch — one statement per read, for tables readable by the anon role.
 */
export declare function withPublicContext<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T>;
/**
 * Runs `fn` inside a transaction where Postgres sees the resolved user id as
 * `auth.jwt()->>'sub'` under `db.authenticatedRole`, so RLS policies behave
 * exactly as they do for a PostgREST-issued call.
 */
export declare function withUserContext<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T>;
