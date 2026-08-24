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
import inlineParams from './inline_params';

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
 *
 * `.transaction()` on this handle runs atomically via `cfni_exec_batch` (see
 * {@link runTransaction}) — pg-proxy has no session to open a real
 * transaction over, so every statement the callback returns is queued and
 * sent as one PostgREST round trip instead. Because of that, the callback
 * must *build* its queries (`.toSQL()`), not `await`/execute them — a later
 * statement cannot read an earlier one's result the way it could inside a
 * real session, unlike connection-string mode's `.transaction()`.
 */
async function supabaseDb(supabase: SupabaseDbConfig, bearerToken: string): Promise<DrizzleDb> {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken)) as unknown as DrizzleDb;
    return Object.assign(db, {
        transaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]) {
            return runTransaction(supabase, bearerToken, build);
        },
    });
}

/**
 * Wraps a live Drizzle postgres transaction handle with a `.transaction()`
 * override that mirrors the Supabase-mode batch API: `build` receives a
 * build-only proxy, must return an array of `.toSQL()` objects (same shape),
 * and this function executes each one sequentially on the real pg session,
 * collecting `ExecResult[]`. Both modes therefore share the identical
 * callback shape — callers never need to detect the transport themselves.
 */
async function postgresDb(drizzleHandle: NodePgDatabase<Record<string, never>>, rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Promise<DrizzleDb> {
    return Object.assign(drizzleHandle as unknown as DrizzleDb, {
        async transaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]> {
            return runPostgresTransaction(rawClient, build);
        },
    });
}

/**
 * Postgres-mode equivalent of `runTransaction`: calls `build` with a
 * build-only handle, then executes each returned query on the raw pg client
 * via an inline-parameterised `query()` call and returns `ExecResult[]`.
 */
async function runPostgresTransaction(
    rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> },
    build: (db: DrizzleDb) => Promise<Query[]> | Query[],
): Promise<ExecResult[]> {
    const queries = await build(buildOnlyDb());
    const results: ExecResult[] = [];
    for (const q of queries) {
        const statement = inlineParams(q.sql, q.params as unknown[]);
        const res = await rawClient.query(statement);
        results.push({ rows: res.rows ?? [], rowCount: res.rowCount ?? null });
    }
    return results;
}


/**
 * Builds a Drizzle handle with no working transport, for Supabase-mode
 * `db.transaction(...)` callbacks. Query builders' `.toSQL()` never touches
 * the session, so this is safe to hand out purely for building statements —
 * but `await`ing a query directly (instead of collecting its `.toSQL()`
 * output) throws immediately here instead of hanging or silently running
 * outside the batch.
 */
function buildOnlyDb(): DrizzleDb {
    const throwIfExecuted = () => {
        throw new Error(
            'db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
            'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
            'inside a Supabase-mode db.transaction() callback runs it outside the batch, with no ' +
            'atomicity, which is exactly what `.transaction()` exists to prevent.',
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
 * PostgREST round-trip authenticated as the anon key. Either way, call
 * `.transaction(...)` on the handle `fn` receives for atomicity across more
 * than one statement — see the module doc for the shape that takes in each mode.
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
        const drizzleHandle = drizzle(client) as unknown as NodePgDatabase<Record<string, never>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await fn(await postgresDb(drizzleHandle, (client as any)));
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
 * own round-trip with no cross-statement transaction unless you call
 * `.transaction(...)` on the handle (the Postgres proxy Drizzle uses in this
 * mode cannot open a real session, so that runs as one atomic
 * `cfni_exec_batch` call instead — see the module doc). Either way this is
 * the wrapper to use for anything user-owned.
 *
 * @param fn Receives the Drizzle handle. In connection-string mode it is
 * also bound to a transaction; in Supabase mode it is not, but its own
 * `.transaction(...)` still provides atomicity across statements there
 * (build-and-return shape, not a live session — see the module doc).
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
            // The transaction handle's session.client is the live pg socket — use it directly.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const txClient = (transaction as any).session?.client ?? client;
            return fn(await postgresDb(transaction as unknown as NodePgDatabase<Record<string, never>>, txClient));
        });
    } finally {
        disconnectPostgres(config);
    }
}

/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport';

/**
 * Runs several statements atomically over `cfni_exec_batch`, backing
 * Supabase-mode `db.transaction()`. `build` does not execute its queries —
 * it **builds** them and returns the array; call `.toSQL()` on each Drizzle
 * query instead of `await`ing it (`await`ing throws immediately; see
 * {@link buildOnlyDb}). Every query is inlined and sent as one round trip:
 * the Postgres function runs them in order inside a single plpgsql call,
 * which is itself an implicit transaction, so a failure on any statement
 * rolls back every statement before it.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken The anon key or user JWT.
 * @param build Returns the queries to run, via `.toSQL()` — never executes them directly.
 * @returns One result per query, in the same order as `build`'s array.
 * @throws If `db.supabase.rawSql` is `false` — `cfni_exec_batch` needs `cfni_exec`, which is disabled too.
 */
async function runTransaction(
    supabase: SupabaseDbConfig,
    bearerToken: string,
    build: (db: DrizzleDb) => Promise<Query[]> | Query[],
): Promise<ExecResult[]> {
    if (supabase.rawSql === false) {
        throw new Error(
            'db: transaction() needs `cfni_exec_batch`, which runs through `cfni_exec` — both are ' +
            'unavailable while `db.supabase.rawSql` is `false`. Install cfni_exec.sql and drop ' +
            '`rawSql: false`, or use `db.connectionString` for a direct Postgres connection instead.',
        );
    }
    const queries = await build(buildOnlyDb());
    const batchQueries: BatchQuery[] = queries.map((query) => ({ sql: query.sql, params: query.params }));
    return runTransactionBatch(supabase, bearerToken, batchQueries);
}
