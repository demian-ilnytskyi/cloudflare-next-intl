import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DbRoutingConfig } from '../types/types.js';
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
 * @param dbOverride A `db` block (`connectionString` or `supabase`) to use
 * for this call instead of `@intl-config`'s — the only thing a standalone
 * (non-Next.js) project needs to pass, since there is no `@intl-config` alias
 * to set up outside Next.js.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set (neither `dbOverride` nor `@intl-config`), or
 * the connection fails.
 */
export declare function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T>;
/**
 * Runs a query as the **signed-in user**, with `request.jwt.claims` and the
 * authenticated role set on the session so RLS policies apply to their id.
 *
 * The session lives on a client scoped to this call and closed when it ends,
 * so the role and claims can never be observed by another caller.
 *
 * @param fn Receives the Drizzle handle
 * @param uid Overrides the user ID for authenticated calls
 * @param dbOverride A `db` block (`connectionString` or `supabase`) to use
 * for this call instead of `@intl-config`'s — the only thing a standalone
 * (non-Next.js) project needs to pass, since there is no `@intl-config` alias
 * to set up outside Next.js.
 */
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null, dbOverride?: DbRoutingConfig): Promise<T>;
/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport.js';
