import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { ExecResult } from './supabase_transport';
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
 * @param uid Connection-string mode only: overrides the user id. Omit it, or
 * pass `null`, in normal use — either way the id then comes from
 * `db.getUserId()` when set, otherwise from the signed-in Firebase user when
 * `firebaseAuth` is configured. `null` is accepted alongside `undefined` so a
 * caller's own lookup (which may itself come back empty) can be passed
 * straight through without an extra check. Ignored in Supabase mode, which
 * resolves identity via `db.getAccessToken`/Firebase instead — see
 * {@link resolveAccessToken}.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, if no user id/access
 * token can be resolved, or the connection fails.
 *
 * @example
 * const mine = await withUserDb((db) => db.select().from(orders));
 */
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null): Promise<T>;
/** One statement's `{rows, rowCount}` result from a `withUserTransaction`/`withPublicTransaction` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport';
/**
 * Runs several statements atomically as the **anonymous** role.
 *
 * See {@link runTransaction} for the batching mechanism. `build` must not
 * execute its queries — return their `.toSQL()` form instead.
 *
 * @param build Returns the queries to run, in order.
 * @returns One `{rows, rowCount}` result per query, in the same order.
 * @throws If `db` is not set, if this isn't Supabase mode (connection-string
 * mode already has real transactions via `withPublicDb`), or if any
 * statement in the batch fails — the whole batch is then rolled back.
 *
 * @example
 * const [inserted] = await withPublicTransaction((db) => [
 *     db.insert(logEntries).values({ event: 'visit' }).toSQL(),
 * ]);
 */
export declare function withPublicTransaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]>;
/**
 * Runs several statements atomically as the **signed-in user**.
 *
 * See {@link runTransaction} for the batching mechanism and
 * {@link withUserDb} for how the caller's identity is resolved. In Supabase
 * mode this is the wrapper to reach for whenever a user-owned write needs
 * more than one statement to succeed or fail together — `withUserDb` alone
 * cannot provide that there.
 *
 * @param build Returns the queries to run, in order. Do not execute them —
 * call `.toSQL()` on each and return the array.
 * @returns One `{rows, rowCount}` result per query, in the same order.
 * @throws If `db` is not set, if no access token can be resolved, if this
 * isn't Supabase mode, or if any statement in the batch fails — the whole
 * batch is then rolled back.
 *
 * @example
 * const [invitation] = await withUserTransaction((db) => [
 *     db.insert(invitations).values({ email }).returning().toSQL(),
 * ]);
 */
export declare function withUserTransaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]>;
