import config from '../config/intl_config';
import requireDbConfig from './require_config';
import connectToPostgres, { disconnectPostgres } from './connection';
import resolveDbMode from './resolve_mode';
import resolveSupabaseEndpoint from './supabase_config';
import createSupabaseTransport from './supabase_transport';
import resolveAccessToken from './access_token';
const DEFAULT_ROLE = 'authenticated';
/**
 * Resolves the user id for `withUserDb`, trying, in order: the explicit `uid`
 * argument, `db.getUserId()`, then the signed-in Firebase user.
 */
async function resolveUserId(uid) {
    if (uid)
        return uid;
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getUserId?.();
    if (fromConfig)
        return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server');
        const { user } = await getAuthUser();
        if (user?.uid)
            return user.uid;
    }
    throw new Error('db: withUserDb could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or configure `firebaseAuth` so the signed-in Firebase uid is used.');
}
function requireRawSql(supabase) {
    if (supabase.rawSql === false) {
        throw new Error('db: withPublicDb/withUserDb need `cfni_exec` to run SQL in Supabase mode, but ' +
            '`db.supabase.rawSql` is set to `false`. Use `supabaseSelect`/`supabaseInsert`/' +
            '`supabaseUpdate`/`supabaseDelete` instead, which call the Supabase REST API directly.');
    }
}
/**
 * Builds a Drizzle handle backed by PostgREST. `bearerToken` decides the role
 * Postgres sees: the anon key for public access, a user JWT for `withUserDb`.
 */
async function supabaseDb(supabase, bearerToken) {
    requireRawSql(supabase);
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken));
    return Object.assign(db, {
        // pg-proxy has no session to open a real transaction over — every
        // statement is its own PostgREST round-trip — so failing loudly here
        // beats silently running the callback non-atomically.
        transaction() {
            throw new Error('db: transactions are not available in Supabase mode. Each statement runs as its ' +
                'own PostgREST round-trip with no shared session, so `.transaction()` cannot provide ' +
                'atomicity. Use connection-string mode (`db.connectionString`) if you need it.');
        },
    });
}
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
export async function withPublicDb(fn) {
    const db = config.db;
    requireDbConfig(db);
    if (resolveDbMode(db) === 'supabase') {
        const supabase = db.supabase;
        const { anonKey } = await resolveSupabaseEndpoint(supabase);
        return fn(await supabaseDb(supabase, anonKey));
    }
    const client = await connectToPostgres(config);
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        return await fn(drizzle(client));
    }
    finally {
        disconnectPostgres(config);
    }
}
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
export async function withUserDb(fn, uid) {
    const db = config.db;
    requireDbConfig(db);
    if (resolveDbMode(db) === 'supabase') {
        const token = await resolveAccessToken(config);
        return fn(await supabaseDb(db.supabase, token));
    }
    const userId = await resolveUserId(uid);
    const client = await connectToPostgres(config);
    const role = db.authenticatedRole ?? DEFAULT_ROLE;
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { sql } = await import('drizzle-orm');
        return await drizzle(client).transaction(async (transaction) => {
            await transaction.execute(sql `select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
            await transaction.execute(sql `set local role ${sql.raw(role)}`);
            return fn(transaction);
        });
    }
    finally {
        disconnectPostgres(config);
    }
}
