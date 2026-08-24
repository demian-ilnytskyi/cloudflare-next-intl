import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { SupabaseDbConfig } from '../types/types';
import config from '../config/intl_config';
import requireDbConfig from './require_config';
import { withDbClient } from './connection';
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
 * via an inline-parameterised `query()` call, wrapped in a real
 * `BEGIN`/`COMMIT` for atomicity, and returns `ExecResult[]`.
 *
 * The client is scoped to one `withDbClient` call, so no other caller can
 * interleave statements into this transaction.
 */
async function runPostgresTransaction(
    rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> },
    build: (db: DrizzleDb) => Promise<Query[]> | Query[],
): Promise<ExecResult[]> {
    const queries = await build(buildOnlyDb());
    await rawClient.query('begin');
    try {
        const results: ExecResult[] = [];
        for (const q of queries) {
            const statement = inlineParams(q.sql, q.params as unknown[]);
            const res = await rawClient.query(statement);
            results.push({ rows: res.rows ?? [], rowCount: res.rowCount ?? null });
        }
        await rawClient.query('commit');
        return results;
    } catch (error) {
        await rawClient.query('rollback').catch(() => undefined);
        throw error;
    }
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
 * @param fn Receives the Drizzle handle; return whatever the caller needs.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, or the connection fails.
 */
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>): Promise<T> {
    const db = config.db;
    requireDbConfig(db);
    
    const resolved = await resolveDbMode(db);
    
    if (resolved.mode === 'supabase') {
        const { anonKey } = await resolveSupabaseEndpoint(resolved.supabase);
        return fn(await supabaseDb(resolved.supabase, anonKey));
    }
    
    return await withDbClient(config, async (client) => {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(client) as unknown as NodePgDatabase<Record<string, never>>;
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await fn(await postgresDb(drizzleHandle, client as any));
    });
}

/**
 * Runs a query as the **signed-in user**, with `request.jwt.claims` and the
 * authenticated role set on the session so RLS policies apply to their id.
 *
 * The session lives on a client scoped to this call and closed when it ends,
 * so the role and claims can never be observed by another caller.
 *
 * @param fn Receives the Drizzle handle
 * @param uid Overrides the user ID for authenticated calls
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
    const role = db.authenticatedRole ?? DEFAULT_ROLE;
    
    return await withDbClient(config, async (client) => {
        const rawClient = client as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> };
        
        await rawClient.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: userId })]);
        await rawClient.query(`set role "${role}"`);
        
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(client) as unknown as NodePgDatabase<Record<string, never>>;
        
        return await fn(await postgresDb(drizzleHandle, rawClient));
    });
}

/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport';

/**
 * Runs several statements atomically over `cfni_exec_batch`, backing
 * Supabase-mode `db.transaction()`. 
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