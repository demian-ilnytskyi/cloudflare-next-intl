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
 * Because no user id is set, RLS policies that test `auth.jwt()->>'sub'` see
 * no user and will deny access — reach for {@link withUserDb} whenever the
 * rows depend on who is asking.
 *
 * The connection is taken from the request's shared client and released when
 * `fn` settles, even if it throws.
 *
 * @param fn Receives the Drizzle handle; return whatever the caller needs.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, or the connection fails.
 *
 * @example
 * const rows = await withPublicDb((db) => db.select().from(bonds).limit(10));
 */
export declare function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T>;
/**
 * Runs a query as the **signed-in user**, inside a transaction where Postgres
 * sees the resolved user id as `auth.jwt()->>'sub'` under
 * `db.authenticatedRole`. RLS policies therefore behave exactly as they do for
 * a PostgREST-issued call — this is the wrapper to use for anything
 * user-owned.
 *
 * The connection is taken from the request's shared client and released when
 * `fn` settles, even if it throws.
 *
 * @param fn Receives the Drizzle handle, already bound to the transaction.
 * @param uid Overrides the user id. Omit it in normal use: the id then comes
 * from `db.getUserId()` when set, otherwise from the signed-in Firebase user
 * when `firebaseAuth` is configured.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, if no user id can be
 * resolved, or the connection fails.
 *
 * @example
 * const mine = await withUserDb((db) => db.select().from(orders));
 */
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T>;
