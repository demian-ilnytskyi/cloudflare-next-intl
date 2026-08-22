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
 * In connection-string mode the connection is taken from the request's
 * shared client and released when `fn` settles, even if it throws. In
 * Supabase mode there is no connection to release — each call is one
 * PostgREST round-trip authenticated as the anon key.
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
 * Runs a query as the **signed-in user**.
 *
 * In connection-string mode this runs inside a transaction where Postgres
 * sees the resolved user id as `auth.jwt()->>'sub'` under
 * `db.authenticatedRole`, so RLS policies behave exactly as they do for a
 * PostgREST-issued call. In Supabase mode identity instead rides on the JWT
 * sent as `Authorization: Bearer` — PostgREST resolves the `authenticated`
 * role and populates `request.jwt.claims` itself, and each statement is its
 * own round-trip with no cross-statement transaction (the Postgres proxy
 * Drizzle uses in this mode cannot open one). Either way this is the wrapper
 * to use for anything user-owned.
 *
 * @param fn Receives the Drizzle handle. In connection-string mode it is
 * bound to a transaction; in Supabase mode it is not — do not rely on
 * multi-statement atomicity there.
 * @param uid Connection-string mode only: overrides the user id. Omit it in
 * normal use — the id then comes from `db.getUserId()` when set, otherwise
 * from the signed-in Firebase user when `firebaseAuth` is configured.
 * Ignored in Supabase mode, which resolves identity via `db.getAccessToken`/
 * Firebase instead — see {@link resolveAccessToken}.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, if no user id/access
 * token can be resolved, or the connection fails.
 *
 * @example
 * const mine = await withUserDb((db) => db.select().from(orders));
 */
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T>;
