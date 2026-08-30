import requireDbConfig from './require_config.js';
import { withDbClient } from './connection.js';
import resolveDbConfig from './resolve_db_config.js';
import resolveDbMode from './resolve_mode.js';
import resolveSupabaseEndpoint from './supabase_config.js';
import createSupabaseTransport from './supabase_transport.js';
import resolveAccessToken from './access_token.js';
import runTransactionBatch from './transaction_batch.js';
import inlineParams from './inline_params.js';
const DEFAULT_ROLE = 'authenticated';
async function resolveUserId(config, uid) {
    if (uid)
        return uid;
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getUserId?.();
    if (fromConfig)
        return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (user?.uid)
            return user.uid;
    }
    throw new Error('db: withUserDb could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or configure `firebaseAuth` so the signed-in Firebase uid is used.');
}
async function resolveAuthenticatedRole(config, db) {
    const claimField = db.authenticatedRoleClaim;
    if (config.firebaseAuth && claimField !== false) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
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
async function supabaseDb(supabase, bearerToken) {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken));
    return Object.assign(db, {
        transaction(build) {
            return runTransaction(supabase, bearerToken, build);
        },
    });
}
async function postgresDb(drizzleHandle, rawClient) {
    return Object.assign(drizzleHandle, {
        async transaction(build) {
            return runPostgresTransaction(rawClient, build);
        },
    });
}
async function runPostgresTransaction(rawClient, build) {
    const queries = await callBuild(build);
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
async function buildOnlyDb() {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    return drizzle(() => {
        throw new Error('db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
            'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
            'inside a Supabase-mode db.transaction() callback runs it outside the batch, with no ' +
            'atomicity, which is exactly what `.transaction()` exists to prevent.');
    });
}
async function callBuild(build) {
    try {
        return await build(await buildOnlyDb());
    }
    catch (error) {
        const cause = error?.cause;
        if (error instanceof Error && cause instanceof Error)
            throw cause;
        throw error;
    }
}
export async function withPublicDb(fn, dbOverride) {
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
        const drizzleHandle = drizzle(client);
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
export async function withUserDb(fn, uid, dbOverride) {
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
                        const targetClient = target;
                        return targetClient.query(injectUidComment(sql, userId), ...args);
                    };
                }
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
async function runTransaction(supabase, bearerToken, build) {
    if (supabase.rawSql === false) {
        throw new Error('db: transaction() needs `cfni_exec_batch`, which runs through `cfni_exec` — both are ' +
            'unavailable while `db.supabase.rawSql` is `false`. Install cfni_exec.sql and drop ' +
            '`rawSql: false`, or use `db.connectionString` for a direct Postgres connection instead.');
    }
    const queries = await callBuild(build);
    const batchQueries = queries.map((query) => ({ sql: query.sql, params: query.params }));
    return runTransactionBatch(supabase, bearerToken, batchQueries);
}
