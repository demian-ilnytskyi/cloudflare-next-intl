import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import config from '../config/intl_config';
import requireDbConfig from './require_config';
import connectToPostgres, { disconnectPostgres } from './connection';

/**
 * The Drizzle handle passed to `withPublicDb`/`withUserDb` callbacks. Use it
 * exactly like a normal Drizzle database (`db.select().from(table)`); it is
 * typed without a schema because you pass your own generated tables in.
 */
export type DrizzleDb = NodePgDatabase<Record<string, never>>;

const DEFAULT_ROLE = 'authenticated';

/**
 * Resolves the user id for `withUserDb`, trying, in order: the explicit `uid`
 * argument, `db.getUserId()`, then the signed-in Firebase user.
 */
async function resolveUserId(uid?: string): Promise<string> {
    if (uid) return uid;
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getUserId?.();
    if (fromConfig) return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server');
        const { user } = await getAuthUser();
        if (user?.uid) return user.uid;
    }
    throw new Error(
        'db: withUserDb could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or configure `firebaseAuth` so the signed-in Firebase uid is used.',
    );
}

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
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T> {
    requireDbConfig(config.db);
    const client = await connectToPostgres(config);
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        return await fn(drizzle(client) as unknown as DrizzleDb);
    } finally {
        disconnectPostgres(config);
    }
}

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
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    const userId = await resolveUserId(uid);
    const client = await connectToPostgres(config);
    const role = db.authenticatedRole ?? DEFAULT_ROLE;
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { sql } = await import('drizzle-orm');
        return await drizzle(client).transaction(async (transaction) => {
            await transaction.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
            await transaction.execute(sql`set local role ${sql.raw(role)}`);
            return fn(transaction as unknown as DrizzleDb);
        });
    } finally {
        disconnectPostgres(config);
    }
}
