import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import config from '../config/intl_config';
import requireDbConfig from './require_config';
import connectToPostgres, { disconnectPostgres } from './connection';

export type DrizzleDb = NodePgDatabase<Record<string, never>>;

const DEFAULT_ROLE = 'authenticated';

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
        'db: withUserContext could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or configure `firebaseAuth` so the signed-in Firebase uid is used.',
    );
}

/**
 * Runs `fn` against the request's pooled connection with no transaction and no
 * role switch — one statement per read, for tables readable by the anon role.
 */
export async function withPublicContext<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T> {
    requireDbConfig(config.db);
    const client = await connectToPostgres(config);
    try {
        return await fn(drizzle(client) as unknown as DrizzleDb);
    } finally {
        disconnectPostgres(config);
    }
}

/**
 * Runs `fn` inside a transaction where Postgres sees the resolved user id as
 * `auth.jwt()->>'sub'` under `db.authenticatedRole`, so RLS policies behave
 * exactly as they do for a PostgREST-issued call.
 */
export async function withUserContext<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    const userId = await resolveUserId(uid);
    const client = await connectToPostgres(config);
    const role = db.authenticatedRole ?? DEFAULT_ROLE;
    try {
        return await drizzle(client).transaction(async (transaction) => {
            await transaction.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
            await transaction.execute(sql`set local role ${sql.raw(role)}`);
            return fn(transaction as unknown as DrizzleDb);
        });
    } finally {
        disconnectPostgres(config);
    }
}
