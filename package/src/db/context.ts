import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { SupabaseDbConfig } from '../types/types';
import config from '../config/intl_config';
import requireDbConfig from './require_config';
import connectToPostgres, { disconnectPostgres } from './connection';
import resolveDbMode from './resolve_mode';
import resolveSupabaseEndpoint from './supabase_config';
import createSupabaseTransport from './supabase_transport';
import resolveAccessToken from './access_token';
import runTransactionBatch, { type BatchQuery } from './transaction_batch';
import type { ExecResult } from './supabase_transport';

/**
 * The Drizzle handle passed to `withPublicDb`/`withUserDb` callbacks. Use it
 * exactly like a normal Drizzle database (`db.select().from(table)`); it is
 * typed without a schema because you pass your own generated tables in.
 */
export type DrizzleDb = NodePgDatabase<Record<string, never>>;

const DEFAULT_ROLE = 'authenticated';

/**
 * Resolves the user id for `withUserDb`, trying, in order: the explicit `uid`
 * argument, `db.getUserId()`, then the signed-in Firebase user. `uid` may be
 * `null` (as well as omitted) to mean "skip this source, try the next one" —
 * useful when the caller's own uid lookup can itself come back empty.
 */
async function resolveUserId(uid?: string | null): Promise<string> {
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
 * Builds a Drizzle handle backed by PostgREST. `bearerToken` decides the role
 * Postgres sees: the anon key for public access, a user JWT for `withUserDb`.
 */
async function supabaseDb(supabase: SupabaseDbConfig, bearerToken: string): Promise<DrizzleDb> {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken)) as unknown as DrizzleDb;
    return Object.assign(db, {
        // pg-proxy has no session to open a real transaction over — every
        // statement is its own PostgREST round-trip — so failing loudly here
        // beats silently running the callback non-atomically.
        transaction() {
            throw new Error(
                'db: transactions are not available in Supabase mode. Each statement runs as its ' +
                'own PostgREST round-trip with no shared session, so `.transaction()` cannot provide ' +
                'atomicity. Use connection-string mode (`db.connectionString`) if you need it.',
            );
        },
    });
}

/**
 * Builds a Drizzle handle with no working transport, for
 * `withUserTransaction`/`withPublicTransaction` callbacks in Supabase mode.
 * Query builders' `.toSQL()` never touches the session, so this is safe to
 * hand out purely for building statements — but `await`ing a query directly
 * (instead of collecting its `.toSQL()` output) throws immediately here
 * instead of hanging or silently running outside the batch.
 */
function buildOnlyDb(): DrizzleDb {
    const throwIfExecuted = () => {
        throw new Error(
            'db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
            'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
            'inside a withUserTransaction/withPublicTransaction callback runs it outside the ' +
            'batch, with no atomicity, which is exactly what these wrappers exist to prevent.',
        );
    };
    return new Proxy({}, { get: () => throwIfExecuted }) as unknown as DrizzleDb;
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
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    const resolved = await resolveDbMode(db);
    if (resolved.mode === 'supabase') {
        const { anonKey } = await resolveSupabaseEndpoint(resolved.supabase);
        return fn(await supabaseDb(resolved.supabase, anonKey));
    }
    const client = await connectToPostgres(config, resolved.connectionString);
    try {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        return await fn(drizzle(client) as unknown as DrizzleDb);
    } finally {
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
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    const resolved = await resolveDbMode(db);
    if (resolved.mode === 'supabase') {
        const token = await resolveAccessToken(config);
        return fn(await supabaseDb(resolved.supabase, token));
    }
    const userId = await resolveUserId(uid);
    const client = await connectToPostgres(config, resolved.connectionString);
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

/** One statement's `{rows, rowCount}` result from a `withUserTransaction`/`withPublicTransaction` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport';

/**
 * Runs several statements atomically, whichever transport mode is active.
 *
 * `build` does not execute its queries — it **builds** them and returns the
 * array. Call `.toSQL()` on each Drizzle query instead of `await`ing it
 * (`await`ing throws immediately here; see {@link buildOnlyDb}). This is
 * only reachable in Supabase mode — connection-string mode already has real
 * atomicity through `withUserDb`/`withPublicDb`'s own `.transaction()`, so
 * `withUserTransaction`/`withPublicTransaction` throw there instead of
 * duplicating that path. In Supabase mode, where `.transaction()` cannot
 * open a session, every query is inlined and sent as one `cfni_exec_batch`
 * call: the Postgres function runs them in order inside a single plpgsql
 * call, which is itself an implicit transaction, so a failure on any
 * statement rolls back every statement before it.
 *
 * @param db The already-resolved `db` config.
 * @param bearerToken The anon key or user JWT.
 * @param build Returns the queries to run, via `.toSQL()` — never executes them directly.
 * @returns One result per query, in the same order as `build`'s array.
 */
async function requireSupabaseTransactionMode(db: NonNullable<typeof config.db>): Promise<SupabaseDbConfig> {
    const resolved = await resolveDbMode(db);
    if (resolved.mode !== 'supabase') {
        throw new Error(
            'db: withUserTransaction/withPublicTransaction only run their Supabase-mode batch path ' +
            'right now. In connection-string mode, use withUserDb/withPublicDb\'s own `.transaction()` ' +
            '— it already provides real atomicity there.',
        );
    }
    const supabase = resolved.supabase;
    if (supabase.rawSql === false) {
        throw new Error(
            'db: withUserTransaction/withPublicTransaction need `cfni_exec_batch`, which runs through ' +
            '`cfni_exec` — both are unavailable while `db.supabase.rawSql` is `false`. Install ' +
            'cfni_exec.sql and drop `rawSql: false`, or use `db.connectionString` for a direct ' +
            'Postgres connection instead.',
        );
    }
    return supabase;
}

async function runTransaction(
    supabase: SupabaseDbConfig,
    bearerToken: string,
    build: (db: DrizzleDb) => Promise<Query[]> | Query[],
): Promise<ExecResult[]> {
    const queries = await build(buildOnlyDb());
    const batchQueries: BatchQuery[] = queries.map((query) => ({ sql: query.sql, params: query.params }));
    return runTransactionBatch(supabase, bearerToken, batchQueries);
}

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
export async function withPublicTransaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]> {
    const db = config.db;
    requireDbConfig(db);
    const supabase = await requireSupabaseTransactionMode(db);
    const { anonKey } = await resolveSupabaseEndpoint(supabase);
    return runTransaction(supabase, anonKey, build);
}

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
export async function withUserTransaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]> {
    const db = config.db;
    requireDbConfig(db);
    const supabase = await requireSupabaseTransactionMode(db);
    const token = await resolveAccessToken(config);
    return runTransaction(supabase, token, build);
}
