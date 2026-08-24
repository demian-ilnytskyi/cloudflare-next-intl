import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
/**
 * The Drizzle handle passed to `withPublicDb`/`withUserDb` callbacks. Use it
 * exactly like a normal Drizzle database (`db.select().from(table)`); it is
 * typed without a schema because you pass your own generated tables in.
 */
export type DrizzleDb = NodePgDatabase<Record<string, never>>;
/**
 * Runs a query as the **anonymous** role: no transaction, no role switch, no
 * user identity attached. Use this for data any visitor may read.
 *
 * @param fn Receives the Drizzle handle; return whatever the caller needs.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, or the connection fails.
 */
export declare function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T>;
/**
 * Runs a query as the **signed-in user**.
 *
 * ✨ Uses Isolated Hyperdrive Networking Strategy: Overlapping connection problems
 * across Next.js isolate contexts previously occurred due to locking constraints on the identical
 * PostgreSQL singleton reference inside Serverless architecture.
 *
 * Moving directly to edge single-usage wrappers inherently closes all leakage scenarios because
 * `.connect() -> setup Roles & Session variables -> process logic -> .end()` exists per connection completely
 * unshared across external requests globally.
 *
 * @param fn Receives the Drizzle handle
 * @param uid Overrides the user ID for authenticated calls
 */
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null): Promise<T>;
/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport';
