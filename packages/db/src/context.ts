import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Query } from 'drizzle-orm';
import type { DbConfig, DbRoutingConfig, SupabaseDbConfig } from './types.js';
import requireDbConfig from './require_config.js';
import { withDbClient } from './connection.js';
import resolveDbMode from './resolve_mode.js';
import resolveSupabaseEndpoint from './supabase_config.js';
import createSupabaseTransport from './supabase_transport.js';
import resolveAccessToken from './access_token.js';
import runTransactionBatch, { type BatchQuery } from './transaction_batch.js';
import type { ExecResult } from './supabase_transport.js';
import inlineParams from './inline_params.js';
import resolveConfigValue from './resolve_config_value.js';

/**
 * The Drizzle handle passed to `withPublicDb`/`withUserDb` callbacks. Use it
 * exactly like a normal Drizzle database (`db.select().from(table)`); it is
 * typed without a schema because you pass your own generated tables in.
 */
export type DrizzleDb = NodePgDatabase<Record<string, never>>;

const DEFAULT_ROLE = 'authenticated';

/**
 * Everything `withUserDb` needs to know about the caller, resolved from the
 * request up front by {@link resolveUserDbCredentials}.
 *
 * Exists because the sources those values come from — cookies, headers, the
 * auth session — are request-scoped, and Next forbids reading them inside
 * a function wrapped in `unstable_cache` or re-run by a background
 * revalidation. Resolve once where the request still exists, then hand the
 * plain values to `withUserDb` inside the cached callback.
 */
export interface UserDbCredentials {
    /** The caller's id, written into `request.jwt.claims.sub` for RLS. */
    uid: string | null;
    /** The JWT sent to PostgREST in Supabase mode. */
    accessToken: string | null;
    /** The Postgres role the session runs as, when it came from a token claim. */
    role: string | null;
}

function isCredentials(value: unknown): value is UserDbCredentials {
    return typeof value === 'object' && value !== null;
}

function throwMissingCredential(what: string): never {
    throw new Error(
        `db: withUserDb was given credentials without ${what}. resolveUserDbCredentials() ` +
        'returns nulls when nobody is signed in — check for that before calling withUserDb.',
    );
}

/**
 * Resolves the caller's id, access token, and role while the request is still
 * readable, so the result can be passed to {@link withUserDb} from somewhere
 * that cannot read cookies — an `unstable_cache` callback, or the background
 * revalidation Next runs for one after the response has been sent.
 *
 * Each field falls back to `null` rather than throwing: a missing token is
 * only an error if the call that uses it actually needs one, and that is
 * `withUserDb`'s decision, not this function's.
 */
export async function resolveUserDbCredentials(config: DbConfig): Promise<UserDbCredentials> {
    const db = config.db;
    requireDbConfig(db);

    const fromConfigUid = (await db.getUserId?.()) ?? null;
    const fromConfigToken = (await db.getAccessToken?.()) ?? null;

    let uid = fromConfigUid;
    let accessToken = fromConfigToken;
    let role: string | null = null;

    if (config.resolveAuthUser && (uid === null || accessToken === null || db.authenticatedRoleClaim !== false)) {
        const authUser = await config.resolveAuthUser();
        if (authUser) {
            uid ??= authUser.uid ?? null;
            accessToken ??= (await authUser.getIdToken(false)) ?? null;
            if (db.authenticatedRoleClaim !== false) {
                const { claims } = await authUser.getIdTokenResult();
                const claimValue = claims[db.authenticatedRoleClaim ?? 'role'];
                if (typeof claimValue === 'string' && claimValue) role = claimValue;
            }
        }
    }

    return { uid, accessToken, role };
}

/**
 * Resolves the user id for `withUserDb`, trying, in order: the explicit `uid`
 * argument, `db.getUserId()`, then `config.resolveAuthUser()`. `uid` may be
 * `null` (as well as omitted) to mean "skip this source, try the next one" —
 * useful when the caller's own uid lookup can itself come back empty.
 */
async function resolveUserId(config: DbConfig, uid?: string | null): Promise<string> {
    if (uid) return uid;
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getUserId?.();
    if (fromConfig) return fromConfig;
    if (config.resolveAuthUser) {
        const authUser = await config.resolveAuthUser();
        if (authUser?.uid) return authUser.uid;
    }
    throw new Error(
        'db: withUserDb could not resolve a user id. Pass one explicitly, set ' +
        '`db.getUserId`, or supply `config.resolveAuthUser` so the signed-in uid is used.',
    );
}

/**
 * Resolves the Postgres role for `withUserDb`'s session. When
 * `config.resolveAuthUser` is set and `db.authenticatedRoleClaim` isn't
 * `false`, the signed-in user's ID token claim (default field `'role'`) wins
 * when present; otherwise falls back to `db.authenticatedRole`, then
 * `DEFAULT_ROLE`.
 */
async function resolveAuthenticatedRole(config: DbConfig, db: DbRoutingConfig, claimed?: string | null): Promise<string> {
    if (claimed) return claimed;
    const claimField = db.authenticatedRoleClaim;
    if (config.resolveAuthUser && claimField !== false && claimed === undefined) {
        const authUser = await config.resolveAuthUser();
        if (authUser) {
            const { claims } = await authUser.getIdTokenResult();
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
 */
async function supabaseDb(supabase: SupabaseDbConfig, bearerToken: string, isServiceRole: boolean): Promise<DrizzleDb> {
    const { drizzle } = await import('drizzle-orm/pg-proxy');
    const db = drizzle(createSupabaseTransport(supabase, bearerToken)) as unknown as DrizzleDb;
    return Object.assign(db, {
        isServiceRole,
        transaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]) {
            return runTransaction(supabase, bearerToken, build);
        },
    });
}

async function postgresDb(
    drizzleHandle: NodePgDatabase<Record<string, never>>,
    rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> },
    isServiceRole: boolean,
): Promise<DrizzleDb> {
    return Object.assign(drizzleHandle as unknown as DrizzleDb, {
        isServiceRole,
        async transaction(build: (db: DrizzleDb) => Promise<Query[]> | Query[]): Promise<ExecResult[]> {
            return runPostgresTransaction(rawClient, build);
        },
    });
}

async function runPostgresTransaction(
    rawClient: { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> },
    build: (db: DrizzleDb) => Promise<Query[]> | Query[],
): Promise<ExecResult[]> {
    const queries = await callBuild(build);
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
 * @param config A `DbConfig` object with `db` set.
 * @returns Whatever `fn` resolves to.
 */
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, config: DbConfig): Promise<T> {
    const db = config.db;
    requireDbConfig(db);

    const resolved = await resolveDbMode(db, config.generate);

    if (resolved.mode === 'supabase') {
        const { anonKey } = await resolveSupabaseEndpoint(resolved.supabase);
        return fn(await supabaseDb(resolved.supabase, anonKey, false));
    }

    return await withDbClient(config, async (client) => {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(client) as unknown as NodePgDatabase<Record<string, never>>;

        await client.query(`set local role anon`);

        return await fn(await postgresDb(drizzleHandle, client, false));
    });
}

/**
 * Runs a query as the **service role** — bypasses RLS entirely.
 *
 * In Supabase Data API mode, `db.supabase.serviceRoleKey` is sent as the
 * sole bearer token (mirroring how {@link withPublicDb} sends `anonKey`),
 * so both the `apikey` header and the Postgres session role are the
 * service role's for the whole call.
 *
 * In connection-string mode, the query runs on the connection exactly as
 * configured — no `set local role` downgrade the way `withPublicDb`/
 * `withUserDb` apply one, since a direct Postgres connection already runs
 * with whatever privileges its own configured role has. Point
 * `db.connectionString` at a role that has that access (a service-role/
 * superuser DSN, or one Postgres itself lets bypass RLS) for this to
 * actually see everything — `withServiceDb` does not grant any privilege
 * on its own here, it only skips the downgrade the other two wrappers do.
 *
 * This bypasses every RLS policy on every table it touches. Never wire
 * `db.supabase.serviceRoleKey`/a privileged `db.connectionString` to
 * anything a request/user can influence — read it the same way any other
 * server secret is, and use this only for genuinely privileged,
 * trusted-code paths (an admin action, a cron job, a webhook handler) —
 * never as a shortcut around `withUserDb`/RLS for an ordinary request.
 *
 * The handle `fn` receives also carries a plain `isServiceRole` boolean
 * (`true` here; `false` on every `withPublicDb`/`withUserDb` handle) — check
 * `(db as unknown as { isServiceRole: boolean }).isServiceRole` in code
 * shared across wrappers that needs to branch on which one is currently
 * running, without threading a separate flag through by hand.
 *
 * @param fn Receives the Drizzle handle; return whatever the caller needs.
 * @param config A `DbConfig` object with either `db.connectionString` or
 * `db.supabase.serviceRoleKey` set.
 * @throws If `db` is not set, or (Supabase mode only) if
 * `db.supabase.serviceRoleKey` does not resolve to a value.
 */
export async function withServiceDb<T>(fn: (db: DrizzleDb) => Promise<T>, config: DbConfig): Promise<T> {
    const db = config.db;
    requireDbConfig(db);

    const resolved = await resolveDbMode(db, config.generate);

    if (resolved.mode === 'supabase') {
        const serviceRoleKey = await resolveConfigValue(resolved.supabase.serviceRoleKey);
        if (!serviceRoleKey) {
            throw new Error(
                'db: withServiceDb could not resolve a service-role key. Set ' +
                '`db.supabase.serviceRoleKey` to your project\'s service_role key, or a function ' +
                'resolving one.',
            );
        }
        return fn(await supabaseDb(resolved.supabase, serviceRoleKey, true));
    }

    return await withDbClient(config, async (client) => {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const drizzleHandle = drizzle(client) as unknown as NodePgDatabase<Record<string, never>>;

        return await fn(await postgresDb(drizzleHandle, client, true));
    });
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
 * @param fn Receives the Drizzle handle
 * @param auth User id string, `null`, or pre-resolved `UserDbCredentials`
 * @param config A `DbConfig` object with `db` set.
 */
export async function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, auth: string | null | UserDbCredentials | undefined, config: DbConfig): Promise<T> {
    const db = config.db;
    requireDbConfig(db);

    const credentials = isCredentials(auth) ? auth : null;
    const uid: string | null = credentials ? credentials.uid : (auth as string | null | undefined) ?? null;

    const resolved = await resolveDbMode(db, config.generate);

    if (resolved.mode === 'supabase') {
        const token = credentials
            ? credentials.accessToken ?? throwMissingCredential('an access token')
            : await resolveAccessToken(config);
        return fn(await supabaseDb(resolved.supabase, token, false));
    }

    const userId = credentials ? uid ?? throwMissingCredential('a user id') : await resolveUserId(config, uid);
    const role = await resolveAuthenticatedRole(config, db, credentials ? credentials.role : undefined);

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

        const resetRole = () => rawClient.query('reset role').catch(() => undefined);

        try {
            const result = await fn(await postgresDb(drizzleHandle, interceptingClient as unknown as { query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number | null }> }, false));
            if (inTransaction) await rawClient.query('commit');
            await resetRole();
            return result;
        } catch (err) {
            if (inTransaction) await rawClient.query('rollback').catch(() => undefined);
            await resetRole();
            throw err;
        }
    });
}

/** One statement's `{rows, rowCount}` result from a Supabase-mode `db.transaction()` batch. */
export type { ExecResult as TransactionResult } from './supabase_transport.js';

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
