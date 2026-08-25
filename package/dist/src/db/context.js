import config from '../config/intl_config';
import requireDbConfig from './require_config';
import { withDbClient } from './connection';
import resolveDbMode from './resolve_mode';
import resolveSupabaseEndpoint from './supabase_config';
import createSupabaseTransport from './supabase_transport';
import resolveAccessToken from './access_token';
import runTransactionBatch from './transaction_batch';
import inlineParams from './inline_params';
const DEFAULT_ROLE = 'authenticated';
/**
 * Resolves the user id for `withUserDb`, trying, in order: the explicit `uid`
 * argument, `db.getUserId()`, then the signed-in Firebase user. `uid` may be
 * `null` (as well as omitted) to mean "skip this source, try the next one" —
 * useful when the caller's own uid lookup can itself come back empty.
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
/**
 * Resolves the Postgres role for `withUserDb`'s session. When `firebaseAuth`
 * is configured and `db.authenticatedRoleClaim` isn't `false`, the signed-in
 * user's Firebase ID token claim (default field `'role'`) wins when present;
 * otherwise falls back to `db.authenticatedRole` (string or sync/async
 * function), then `DEFAULT_ROLE`.
 */
async function resolveAuthenticatedRole(db) {
    const claimField = db.authenticatedRoleClaim;
    if (config.firebaseAuth && claimField !== false) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server');
        const { user } = await getAuthUser();
        if (user && typeof user.getIdTokenResult === 'function') {
            const { claims } = await user.getIdTokenResult();
            const claimValue = claims[claimField ?? 'role'];
            if (typeof claimValue === 'string' && claimValue)
                return claimValue;
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
async function supabaseDb(supabase, bearerToken) {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken));
    return Object.assign(db, {
        transaction(build) {
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
async function postgresDb(drizzleHandle, rawClient) {
    return Object.assign(drizzleHandle, {
        async transaction(build) {
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
async function runPostgresTransaction(rawClient, build) {
    const queries = await build(buildOnlyDb());
    await rawClient.query('begin');
    try {
        const results = [];
        for (const q of queries) {
            const statement = inlineParams(q.sql, q.params);
            const res = await rawClient.query(statement);
            results.push({ rows: res.rows ?? [], rowCount: res.rowCount ?? null });
        }
        await rawClient.query('commit');
        return results;
    }
    catch (error) {
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
function buildOnlyDb() {
    const throwIfExecuted = () => {
        throw new Error('db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
            'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
            'inside a Supabase-mode db.transaction() callback runs it outside the batch, with no ' +
            'atomicity, which is exactly what `.transaction()` exists to prevent.');
    };
    return new Proxy({}, { get: () => throwIfExecuted });
}
/**
 * Runs a query as the **anonymous** role: no transaction, no role switch, no
 * user identity attached. Use this for data any visitor may read.
 *
 * @param fn Receives the Drizzle handle; return whatever the caller needs.
 * @returns Whatever `fn` resolves to.
 * @throws If `db` is not set on your `RoutingConfig`, or the connection fails.
 */
export async function withPublicDb(fn) {
    const db = config.db;
    requireDbConfig(db);
    const resolved = await resolveDbMode(db);
    if (resolved.mode === 'supabase') {
        const { anonKey } = await resolveSupabaseEndpoint(resolved.supabase);
        return fn(await supabaseDb(resolved.supabase, anonKey));
    }
    return await withDbClient(config, async (client) => {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(client);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await fn(await postgresDb(drizzleHandle, client));
    });
}
function injectUidComment(sql, userId) {
    if (typeof sql === 'string') {
        if (/^(select|with)\b/i.test(sql.trimStart())) {
            return `/* uid:${userId} */ ${sql}`;
        }
        return sql;
    }
    if (sql && typeof sql === 'object' && typeof sql.text === 'string') {
        const obj = sql;
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
 */
export async function withUserDb(fn, uid) {
    const db = config.db;
    requireDbConfig(db);
    const resolved = await resolveDbMode(db);
    if (resolved.mode === 'supabase') {
        const token = await resolveAccessToken(config);
        return fn(await supabaseDb(resolved.supabase, token));
    }
    const userId = await resolveUserId(uid);
    const role = await resolveAuthenticatedRole(db);
    return await withDbClient(config, async (client) => {
        const rawClient = client;
        const setSessionState = async () => {
            await rawClient.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: userId })]);
            await rawClient.query(`set role "${role.replace(/"/g, '""')}"`);
        };
        const isSelectOnly = (sql) => {
            const text = typeof sql === 'string' ? sql : sql?.text;
            return typeof text === 'string' && /^(select|with)\b/i.test(text.trimStart());
        };
        let inTransaction = false;
        let sessionStateSet = false;
        let gate = Promise.resolve();
        const serialize = (op) => {
            const run = gate.then(op, op);
            gate = run.catch(() => undefined);
            return run;
        };
        const interceptingClient = new Proxy(client, {
            get(target, prop) {
                if (prop === 'query') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return async (sql, ...args) => {
                        const text = typeof sql === 'string' ? sql : (typeof sql?.text === 'string' ? sql.text : '');
                        const isBegin = /^begin\b/i.test(text.trimStart());
                        const isCommitOrRollback = /^(commit|rollback)\b/i.test(text.trimStart());
                        if (isBegin) {
                            return await serialize(async () => {
                                if (!sessionStateSet) {
                                    await rawClient.query('begin');
                                    inTransaction = true;
                                    await setSessionState();
                                    sessionStateSet = true;
                                }
                                else if (!inTransaction) {
                                    await rawClient.query('begin');
                                    inTransaction = true;
                                }
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
                        await serialize(async () => {
                            if (!sessionStateSet) {
                                if (isSelectOnly(sql)) {
                                    await rawClient.query('begin');
                                    inTransaction = true;
                                    await setSessionState();
                                    await rawClient.query('commit');
                                    inTransaction = false;
                                }
                                else {
                                    await rawClient.query('begin');
                                    inTransaction = true;
                                    await setSessionState();
                                }
                                sessionStateSet = true;
                            }
                            else if (!inTransaction && !isSelectOnly(sql)) {
                                await rawClient.query('begin');
                                inTransaction = true;
                            }
                        });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return target.query(injectUidComment(sql, userId), ...args);
                    };
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const value = target[prop];
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(interceptingClient);
        try {
            const result = await fn(await postgresDb(drizzleHandle, interceptingClient));
            if (inTransaction)
                await rawClient.query('commit');
            return result;
        }
        catch (err) {
            if (inTransaction)
                await rawClient.query('rollback').catch(() => undefined);
            throw err;
        }
    });
}
/**
 * Runs several statements atomically over `cfni_exec_batch`, backing
 * Supabase-mode `db.transaction()`.
 */
async function runTransaction(supabase, bearerToken, build) {
    if (supabase.rawSql === false) {
        throw new Error('db: transaction() needs `cfni_exec_batch`, which runs through `cfni_exec` — both are ' +
            'unavailable while `db.supabase.rawSql` is `false`. Install cfni_exec.sql and drop ' +
            '`rawSql: false`, or use `db.connectionString` for a direct Postgres connection instead.');
    }
    const queries = await build(buildOnlyDb());
    const batchQueries = queries.map((query) => ({ sql: query.sql, params: query.params }));
    return runTransactionBatch(supabase, bearerToken, batchQueries);
}
