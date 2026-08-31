import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { DbRoutingConfig, SupabaseDbConfig } from '../types/types.js';
import requireDbConfig from './require_config.js';
import { withDbClient, type DbConfig } from './connection.js';
import resolveDbConfig from './resolve_db_config.js';
import resolveDbMode from './resolve_mode.js';
import resolveSupabaseEndpoint from './supabase_config.js';
import createSupabaseTransport from './supabase_transport.js';
import resolveAccessToken from './access_token.js';
import runTransactionBatch, { type BatchQuery } from './transaction_batch.js';
import type { ExecResult } from './supabase_transport.js';
import inlineParams from './inline_params.js';

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
async function resolveUserId(config: DbConfig, uid?: string | null): Promise<string> {
    if (uid) return uid;
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getUserId?.();
    if (fromConfig) return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user?.uid) return user.uid;
    }
    throw new Error(
        'db: withUserDb could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or configure `firebaseAuth` so the signed-in Firebase uid is used.',
    );
}

/**
 * Resolves the Postgres role for `withUserDb`'s session. When `firebaseAuth`
 * is configured and `db.authenticatedRoleClaim` isn't `false`, the signed-in
 * user's Firebase ID token claim (default field `'role'`) wins when present;
 * otherwise falls back to `db.authenticatedRole` (string or sync/async
 * function), then `DEFAULT_ROLE`.
 */
async function resolveAuthenticatedRole(config: DbConfig, db: DbRoutingConfig): Promise<string> {
    const claimField = db.authenticatedRoleClaim;
    if (config.firebaseAuth && claimField !== false) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user && typeof user.getIdTokenResult === 'function') {
            const { claims } = await user.getIdTokenResult();
            const claimValue = claims[claimField ?? 'role'];
            if (typeof claimValue === 'string' && claimValue) return claimValue;
        }
    }
    if (db.authenticatedRole) {
        return typeof db.authenticatedRole === 'function' ? await db.authenticatedRole() : db.authenticatedRole;
    }
    return DEFAULT_ROLE;
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
async function postgresDb(
    drizzleHandle: NodePgDatabase<Record<string, never>>,
    rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> },
    setSessionState?: () => Promise<void>,
): Promise<DrizzleDb> {
    return Object.assign(drizzleHandle as unknown as DrizzleDb, {
        async transaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]> {
            return runPostgresTransaction(rawClient, build, setSessionState);
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
    setSessionState?: () => Promise<void>,
): Promise<ExecResult[]> {
    const queries = await callBuild(build);
    await rawClient.query('begin');
    try {
        if (setSessionState) await setSessionState();
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
    } finally {
        if (setSessionState) await rawClient.query('reset role').catch(() => undefined);
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
async function buildOnlyDb(): Promise<DrizzleDb> {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    return drizzle(() => {
        throw new Error(
            'db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
            'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
            'inside a Supabase-mode db.transaction() callback runs it outside the batch, with no ' +
            'atomicity, which is exactly what `.transaction()` exists to prevent.',
        );
    }) as unknown as DrizzleDb;
}

/**
 * Runs `build` against a fresh build-only handle, unwrapping pg-proxy's
 * `Failed query: ...` wrapper (with the real message on `.cause`) so a
 * caller who awaits a query instead of collecting `.toSQL()` sees the
 * build-only guidance directly, not the wrapper's generic text.
 */
async function callBuild(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<Query[]> {
    try {
        return await build(await buildOnlyDb());
    } catch (error) {
        const cause = (error as { cause?: unknown })?.cause;
        if (error instanceof Error && cause instanceof Error) throw cause;
        throw error;
    }
}

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
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
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
        
        return await fn(await postgresDb(drizzleHandle, client));
    }); // no setSessionState — public role, no identity needed
}

function injectUidComment(sql: unknown, userId: string): unknown {
    if (typeof sql === 'string') {
        if (/^(select|with)\b/i.test(sql.trimStart())) {
            return `/* uid:${userId} */ ${sql}`;
        }
        return sql;
    }
    if (sql && typeof sql === 'object' && typeof (sql as { text?: unknown }).text === 'string') {
        const obj = sql as { text: string };
        if (/^(select|with)\b/i.test(obj.text.trimStart())) {
            return { ...obj, text: `/* uid:${userId} */ ${obj.text}` };
        }
    }
    return sql;
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
 * @param dbOverride A `db` block (`connectionString` or `supabase`) to use
 * for this call instead of `@intl-config`'s — the only thing a standalone
 * (non-Next.js) project needs to pass, since there is no `@intl-config` alias
 * to set up outside Next.js.
 */
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, uid?: string | null, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    const db = config.db;
    requireDbConfig(db);

    const resolved = await resolveDbMode(db);

    if (resolved.mode === 'supabase') {
        const token = await resolveAccessToken(config);
        return fn(await supabaseDb(resolved.supabase, token));
    }

    const userId = await resolveUserId(config, uid);
    const role = await resolveAuthenticatedRole(config, db);
    
    return await withDbClient(config, async (client) => {
        const rawClient = client as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> };

        const setSessionState = async () => {
            await rawClient.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
            await rawClient.query(`set local role "${role.replace(/"/g, '""')}"`);
        };

        let inTransaction = false;
        let gate: Promise<unknown> = Promise.resolve();
        const serialize = <R>(op: () => Promise<R>): Promise<R> => {
            const run = gate.then(op, op);
            gate = run.catch(() => undefined);
            return run;
        };

        const beginWithIdentity = async () => {
            if (inTransaction) return;
            await rawClient.query('begin');
            try {
                await setSessionState();
            } catch (error) {
                await rawClient.query('rollback').catch(() => undefined);
                throw error;
            }
            inTransaction = true;
        };

        const interceptingClient = new Proxy(client, {
            get(target, prop) {
                if (prop === 'query') {
                    return async (sql: string | { text?: unknown }, ...args: unknown[]) => {
                        const text = typeof sql === 'string' ? sql : (typeof sql?.text === 'string' ? sql.text : '');
                        const isBegin = /^begin\b/i.test(text.trimStart());
                        const isCommitOrRollback = /^(commit|rollback)\b/i.test(text.trimStart());

                        if (isBegin) {
                            return await serialize(async () => {
                                await beginWithIdentity();
                                return { rows: [], rowCount: 0 };
                            });
                        }

                        if (isCommitOrRollback) {
                            return await serialize(async () => {
                                if (inTransaction) {
                                    const res = await rawClient.query(text);
                                    inTransaction = false;
                                    return res;
                                }
                                return { rows: [], rowCount: 0 };
                            });
                        }

                        await serialize(beginWithIdentity);

                        const targetClient = target as unknown as { query: (...queryArgs: unknown[]) => unknown };
                        return targetClient.query(injectUidComment(sql, userId), ...args);
                    };
                }
                const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });

        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(interceptingClient) as unknown as NodePgDatabase<Record<string, never>>;

        try {
            const result = await fn(await postgresDb(drizzleHandle, interceptingClient as unknown as { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> }));
            if (inTransaction) await rawClient.query('commit');
            return result;
        } catch (err) {
            if (inTransaction) await rawClient.query('rollback').catch(() => undefined);
            throw err;
        } finally {
            // Belt-and-suspenders: reset role before the connection returns to the pool.
            // `set local role` already expires at commit/rollback, but an explicit reset
            // matches the PR pattern and guards against any edge case where the
            // transaction did not cleanly end.
            await rawClient.query('reset role').catch(() => undefined);
        }
    });
}

/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport.js';

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
    const queries = await callBuild(build);
    const batchQueries: BatchQuery[] = queries.map((query) => ({ sql: query.sql, params: query.params }));
    return runTransactionBatch(supabase, bearerToken, batchQueries);
}