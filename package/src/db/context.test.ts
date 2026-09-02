import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tx, withDbClient, getAuthUser, config, proxyDrizzle, proxyDb, runTransactionBatch } = vi.hoisted(() => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const otherMethod = vi.fn();

    const pgClient = { query: clientQuery, otherMethod };
    const tx = {
        _clientQuery: clientQuery, // exposed for test assertions
    };

    const withDbClient = vi.fn().mockImplementation(async (config: unknown, queryFn: (c: typeof pgClient) => Promise<unknown>) => {
        return queryFn(pgClient);
    });

    const getAuthUser = vi.fn().mockResolvedValue({ user: { uid: 'firebase-uid', getIdToken: vi.fn().mockResolvedValue('firebase-jwt'), getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) }, loading: false });
    const config: Record<string, unknown> = { locales: ['en'], defaultLocale: 'en', db: { connectionString: 'postgresql://x' } };
    const proxyDb = { select: vi.fn(), execute: vi.fn() };
    const proxyDrizzle = vi.fn(() => proxyDb);
    const runTransactionBatch = vi.fn();
    return { tx, withDbClient, getAuthUser, config, proxyDrizzle, proxyDb, runTransactionBatch };
});

vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn((client) => ({ client, select: vi.fn() })) }));
vi.mock('drizzle-orm/pg-proxy', () => ({ drizzle: proxyDrizzle }));
vi.mock('./connection', () => ({
    withDbClient,
    resetConnectionState: vi.fn(),
    withSessionLock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    default: vi.fn().mockRejectedValue(new Error('default export should not be used')),
    disconnectPostgres: vi.fn(),
}));
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));
vi.mock('../config/intl_config', () => ({ default: config }));
vi.mock('./transaction_batch', () => ({ default: runTransactionBatch }));

import { withPublicDb, withUserDb, resolveUserDbCredentials } from './context.js';

beforeEach(() => {
    tx._clientQuery.mockClear();
    tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    withDbClient.mockClear();
    proxyDrizzle.mockClear();
    runTransactionBatch.mockReset();
    getAuthUser.mockReset();
    getAuthUser.mockResolvedValue({ user: { uid: 'firebase-uid', getIdToken: vi.fn().mockResolvedValue('firebase-jwt'), getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) }, loading: false });
    config.db = { connectionString: 'postgresql://x' };
    config.firebaseAuth = undefined;
});

describe('withPublicDb', () => {
    it('runs the callback with a drizzle db', async () => {
        const result = await withPublicDb(async (db) => { expect(db).toBeDefined(); return 42; });
        expect(result).toBe(42);
        expect(withDbClient).toHaveBeenCalledTimes(1);
    });

    it('rejects when the callback throws', async () => {
        await expect(withPublicDb(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(withDbClient).toHaveBeenCalledTimes(1);
    });

    it('sets "anon" role before executing the callback in Postgres mode', async () => {
        await withPublicDb(async () => 'ok');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role anon');
    });

    it('throws when db config is missing', async () => {
        config.db = undefined;
        await expect(withPublicDb(async () => 1)).rejects.toThrow(/`db` is not set/);
    });
});

describe('withUserDb', () => {
    it('sets jwt claims and role on the call-scoped session', async () => {
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'uid-1');
        expect(tx._clientQuery).toHaveBeenCalledWith(
            `select set_config('request.jwt.claims', $1, true)`,
            [JSON.stringify({ sub: 'uid-1' })],
        );
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "authenticated"');
    });

    it('runs a lone select-only query inside a transaction with identity set, then commits', async () => {
        tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select * from users');
            return 'ok';
        }, 'uid-1');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toEqual([
            'begin',
            `select set_config('request.jwt.claims', $1, true)`,
            'set local role "authenticated"',
            '/* uid:uid-1 */ select * from users',
            'commit',
            'reset role',
        ]);
    });

    it('opens a real transaction (no early commit) when the first query is a write', async () => {
        tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) {
                await client.query('insert into users (id) values (1)');
                await client.query('select * from users');
            }
            return 'ok';
        }, 'uid-1');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toEqual([
            'begin',
            `select set_config('request.jwt.claims', $1, true)`,
            'set local role "authenticated"',
            'insert into users (id) values (1)',
            '/* uid:uid-1 */ select * from users',
            'commit',
            'reset role',
        ]);
    });

    it('rolls back the session transaction when the callback throws after a write', async () => {
        tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        await expect(withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('insert into users (id) values (1)');
            throw new Error('callback failed');
        }, 'uid-1')).rejects.toThrow('callback failed');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toContain('rollback');
        expect(calls).not.toContain('commit');
    });

    it('prepends SQL comment with user id to SELECT queries for Hyperdrive caching', async () => {
        tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown>; release?: () => string; prop?: string } }).client;
            if (client) {
                await client.query('select * from users');
                await client.query({ text: 'select * from items', values: [1] });
                await client.query('with cte as (select 1) select * from cte');
                await client.query({ text: 'with cte as (select 1) select * from cte' });
                await client.query('delete from users');
                await client.query({ text: 'delete from items', values: [1] });
                await client.query({ values: [1] });
                await client.query(null);
                await client.query(123);
                await client.query(true);
                await client.query(undefined);
                await client.query({ text: 123 });
                if (typeof client.release === 'function') client.release();
                void client.prop;
            }
        }, 'uid-123');
        expect(tx._clientQuery).toHaveBeenCalledWith('/* uid:uid-123 */ select * from users');
        expect(tx._clientQuery).toHaveBeenCalledWith({ text: '/* uid:uid-123 */ select * from items', values: [1] });
        expect(tx._clientQuery).toHaveBeenCalledWith('/* uid:uid-123 */ with cte as (select 1) select * from cte');
        expect(tx._clientQuery).toHaveBeenCalledWith({ text: '/* uid:uid-123 */ with cte as (select 1) select * from cte' });
        expect(tx._clientQuery).toHaveBeenCalledWith('delete from users');
        expect(tx._clientQuery).toHaveBeenCalledWith({ text: 'delete from items', values: [1] });
        expect(tx._clientQuery).toHaveBeenCalledWith({ values: [1] });
        expect(tx._clientQuery).toHaveBeenCalledWith(null);
        expect(tx._clientQuery).toHaveBeenCalledWith(123);
        expect(tx._clientQuery).toHaveBeenCalledWith(true);
        expect(tx._clientQuery).toHaveBeenCalledWith(undefined);
    });

    it('falls back to the firebase auth user when no uid is given', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        await withUserDb(async () => 'ok');
        expect(getAuthUser).toHaveBeenCalled();
    });

    it('prefers db.getUserId over the firebase user', async () => {
        const getUserId = vi.fn().mockResolvedValue('custom-uid');
        config.db = { connectionString: 'postgresql://x', getUserId };
        await withUserDb(async () => 'ok');
        expect(getUserId).toHaveBeenCalled();
    });

    it('falls back to firebase user when db.getUserId returns null', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        const getUserId = vi.fn().mockResolvedValue(null);
        config.db = { connectionString: 'postgresql://x', getUserId };
        await withUserDb(async () => 'ok');
        expect(getAuthUser).toHaveBeenCalled();
    });

    it('sets custom authenticated role if configured', async () => {
        config.db = { connectionString: 'postgresql://x', authenticatedRole: 'custom_role' };
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'uid-1');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "custom_role"');
    });

    it('uses the firebase id token role claim over authenticatedRole when both are present', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        config.db = { connectionString: 'postgresql://x', authenticatedRole: 'fallback_role' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'firebase-uid', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'claim_role' } }) },
            loading: false,
        });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'firebase-uid');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "claim_role"');
    });

    it('reads the role from a custom authenticatedRoleClaim field name', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        config.db = { connectionString: 'postgresql://x', authenticatedRoleClaim: 'pg_role' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'firebase-uid', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { pg_role: 'custom_claim_role' } }) },
            loading: false,
        });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'firebase-uid');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "custom_claim_role"');
    });

    it('falls back to authenticatedRole when authenticatedRoleClaim is false, even with firebaseAuth configured', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        config.db = { connectionString: 'postgresql://x', authenticatedRoleClaim: false, authenticatedRole: 'fallback_role' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'firebase-uid', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'claim_role' } }) },
            loading: false,
        });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'firebase-uid');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "fallback_role"');
        expect(getAuthUser).not.toHaveBeenCalled();
    });

    it('falls back to authenticatedRole when the claim value is an empty string', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        config.db = { connectionString: 'postgresql://x', authenticatedRole: 'fallback_role' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'firebase-uid', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: '' } }) },
            loading: false,
        });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'firebase-uid');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "fallback_role"');
    });

    it('falls back to authenticatedRole when the claim value is not a string', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        config.db = { connectionString: 'postgresql://x', authenticatedRole: 'fallback_role' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'firebase-uid', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 42 } }) },
            loading: false,
        });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'firebase-uid');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "fallback_role"');
    });

    it('supports an async function for authenticatedRole', async () => {
        const authenticatedRole = vi.fn().mockResolvedValue('async_role');
        config.db = { connectionString: 'postgresql://x', authenticatedRole };
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'uid-1');
        expect(authenticatedRole).toHaveBeenCalled();
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "async_role"');
    });

    it('defaults to the "authenticated" role when nothing is configured', async () => {
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, 'uid-1');
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "authenticated"');
    });

    it('throws when firebase auth user is missing', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        getAuthUser.mockResolvedValueOnce({ user: null, loading: false });
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/user id/i);
    });

    it('throws when no uid can be resolved', async () => {
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/user id/i);
    });

    it('throws when db config is missing', async () => {
        config.db = undefined;
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/`db` is not set/);
    });
});

describe('supabase mode', () => {
    beforeEach(() => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' } };
    });

    it('withPublicDb bypasses the hyperdrive intercept proxy', async () => {
        const result = await withPublicDb(async (db) => { expect(db).toBe(proxyDb); return 7; });
        expect(result).toBe(7);
        expect(withDbClient).not.toHaveBeenCalled(); 
        expect(proxyDrizzle).toHaveBeenCalledTimes(1);
    });

    it('the Supabase-mode db.transaction() runs its build callback as one batch', async () => {
        runTransactionBatch.mockResolvedValue([{ rows: [['1']], rowCount: 1 }]);
        const result = await withPublicDb(async (db) =>
            (db as unknown as { transaction: (build: () => unknown) => Promise<unknown> }).transaction(() => [
                { sql: 'insert into t (id) values ($1)', params: [1] },
            ]),
        );
        expect(result).toEqual([{ rows: [['1']], rowCount: 1 }]);
        expect(runTransactionBatch).toHaveBeenCalledWith(
            { url: 'https://abc.supabase.co', anonKey: 'anon-key' },
            'anon-key',
            [{ sql: 'insert into t (id) values ($1)', params: [1] }],
        );
    });

    it('withUserDb runs without touching the hyperdrive wrappers', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' }, getAccessToken: () => 'user-jwt' };
        const result = await withUserDb(async (db) => { expect(db).toBe(proxyDb); return 'ok'; });
        expect(result).toBe('ok');
        expect(withDbClient).not.toHaveBeenCalled();
        expect(tx._clientQuery).not.toHaveBeenCalled();
    });

    it('withUserDb surfaces a missing access token', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' }, getAccessToken: () => null };
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/access token/i);
    });

    it('routes to the Hyperdrive intercept when a connection string is set, overriding supabase config', async () => {
        config.db = { connectionString: 'postgresql://x', supabase: {} };
        await withPublicDb(async () => 1);
        expect(withDbClient).toHaveBeenCalledTimes(1);
        expect(proxyDrizzle).not.toHaveBeenCalled();
    });
});

describe('db.transaction() in Supabase mode', () => {
    beforeEach(() => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' }, getAccessToken: () => 'user-jwt' };
    });

    interface BatchDb { transaction: (build: (db: unknown) => unknown) => Promise<unknown> }

    it('sends the queries build() returns to runTransactionBatch, as {sql, params}', async () => {
        runTransactionBatch.mockResolvedValue([{ rows: [['1']], rowCount: 1 }]);
        const result = await withUserDb((db) => (db as unknown as BatchDb).transaction(() => [{ sql: 'insert into t (id) values ($1)', params: [1] }]));
        expect(result).toEqual([{ rows: [['1']], rowCount: 1 }]);
        expect(runTransactionBatch).toHaveBeenCalledWith(
            { url: 'https://abc.supabase.co', anonKey: 'anon-key' },
            'user-jwt',
            [{ sql: 'insert into t (id) values ($1)', params: [1] }],
        );
    });

    it('withPublicDb uses the anon key, not an access token', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' } };
        runTransactionBatch.mockResolvedValue([]);
        await withPublicDb((db) => (db as unknown as BatchDb).transaction(() => []));
        expect(runTransactionBatch).toHaveBeenCalledWith(expect.anything(), 'anon-key', []);
    });

    it('the build callback receives a handle that throws if executed instead of built', async () => {
        runTransactionBatch.mockResolvedValue([]);
        await withUserDb((db) =>
            (db as unknown as BatchDb).transaction((build) => {
                void build;
                const [driver] = proxyDrizzle.mock.calls[proxyDrizzle.mock.calls.length - 1]!;
                expect(() => (driver as () => unknown)()).toThrow(/for building statements only/);
                return [];
            }),
        );
    });

    it('throws when db.supabase.rawSql is false, without attempting the batch call', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key', rawSql: false }, getAccessToken: () => 'user-jwt' };
        await expect(withUserDb((db) => (db as unknown as BatchDb).transaction(() => []))).rejects.toThrow(/rawSql.*false/);
        expect(runTransactionBatch).not.toHaveBeenCalled();
    });

    it('propagates a batch failure — the caller sees the whole batch was rolled back', async () => {
        runTransactionBatch.mockRejectedValue(new Error('db: Supabase rejected the query — constraint violated.'));
        await expect(
            withUserDb((db) => (db as unknown as BatchDb).transaction(() => [{ sql: 'insert into t (id) values ($1)', params: [1] }])),
        ).rejects.toThrow(/constraint violated/);
    });

    it('unwraps a build error whose .cause is an Error — the caller sees the cause, not the wrapper', async () => {
        const wrapper = new Error('Failed query: insert into "profiles" ("id") values ($1)');
        (wrapper as { cause?: unknown }).cause = new Error('for building statements only');
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => {
                    throw wrapper;
                }),
            ),
        ).rejects.toThrow(/for building statements only/);
    });

    it('rethrows a build error as-is when it has no Error .cause', async () => {
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => {
                    throw new Error('plain build failure');
                }),
            ),
        ).rejects.toThrow(/plain build failure/);
    });
});

describe('db.transaction() in Postgres/Hyperdrive mode — execution logic wrapper', () => {
    interface BatchDb { transaction: (build: (db: unknown) => unknown) => Promise<unknown> }

    const makeQueryResult = (rows: unknown[], rowCount = rows.length) => ({ rows, rowCount });

    beforeEach(() => {
        tx._clientQuery.mockReset();
        config.db = { connectionString: 'postgresql://x' };
    });

    it('withUserDb: db.transaction() executes queries sequentially inside begin/commit with uid comment and jwt claims set', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        tx._clientQuery
            .mockResolvedValueOnce(makeQueryResult([])) 
            .mockResolvedValueOnce(makeQueryResult([])) 
            .mockResolvedValueOnce(makeQueryResult([])) 
            .mockResolvedValueOnce(makeQueryResult([{ id: 1 }]))
            .mockResolvedValueOnce(makeQueryResult([], 1)) 
            .mockResolvedValueOnce(makeQueryResult([])); 

        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t where id = $1', params: [1] },
                { sql: 'insert into t (val) values ($1)', params: ['x'] },
            ]),
        'uid-1');

        expect(result).toEqual([
            { rows: [{ id: 1 }], rowCount: 1 },
            { rows: [], rowCount: 1 },
        ]);
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toEqual([
            'begin',
            `select set_config('request.jwt.claims', $1, true)`,
            'set local role "authenticated"',
            '/* uid:uid-1 */ select id from t where id = 1',
            "insert into t (val) values ('x')",
            'commit',
            'reset role',
        ]);
    });

    it('withPublicDb: executes arrays perfectly matching PG responses', async () => {
        tx._clientQuery
            .mockResolvedValueOnce(makeQueryResult([]))
            .mockResolvedValueOnce(makeQueryResult([]))
            .mockResolvedValueOnce(makeQueryResult([['row1'], ['row2']]))
            .mockResolvedValueOnce(makeQueryResult([]));

        const result = await withPublicDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t', params: [] },
            ]),
        );

        expect(result).toEqual([{ rows: [['row1'], ['row2']], rowCount: 2 }]);
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toEqual(['set local role anon', 'begin', 'select id from t', 'commit']);
    });

    it('the build callback in postgres mode also receives a build-only handle that throws on execute', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await withUserDb((db) =>
            (db as unknown as BatchDb).transaction((buildDb) => {
                void buildDb;
                const [driver] = proxyDrizzle.mock.calls[proxyDrizzle.mock.calls.length - 1]!;
                expect(() => (driver as () => unknown)()).toThrow(/for building statements only/);
                return [];
            }),
        'uid-1');
    });

    it('unwraps a build error whose .cause is an Error in postgres mode too', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        const wrapper = new Error('Failed query: insert into "profiles" ("id") values ($1)');
        (wrapper as { cause?: unknown }).cause = new Error('for building statements only');
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => {
                    throw wrapper;
                }),
            'uid-1'),
        ).rejects.toThrow(/for building statements only/);
    });

    it('rethrows a build error as-is in postgres mode when it has no Error .cause', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => {
                    throw new Error('plain build failure');
                }),
            'uid-1'),
        ).rejects.toThrow(/plain build failure/);
    });

    it('executes queries in order and forwards correct sql/params after inlining', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));

        await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'insert into a (x) values ($1)', params: [42] },
                { sql: 'insert into b (y) values ($1)', params: ['hello'] },
            ]),
        'uid-1');

        const calls = tx._clientQuery.mock.calls.map((c) => c[0] as string);
        expect(calls).toHaveLength(7); // begin, set_config, set local role, q1, q2, commit, reset role
        expect(calls[3]).toContain('42');
        expect(calls[4]).toContain("'hello'");
    });

    it('propagates a pg client error and rolls back the transaction', async () => {
        tx._clientQuery.mockImplementation((sql: string) => (
            sql.startsWith('insert into t')
                ? Promise.reject(new Error('duplicate key value'))
                : Promise.resolve(makeQueryResult([]))
        ));
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => [
                    { sql: 'insert into t (id) values ($1)', params: [1] },
                ]),
            'uid-1'),
        ).rejects.toThrow(/duplicate key value/);
        
        expect(tx._clientQuery.mock.calls.map((c) => c[0])).toContain('rollback');
    });

    it('handles rollback failure gracefully during postgres transaction error', async () => {
        tx._clientQuery.mockImplementation((sql: string) => {
            if (sql.startsWith('insert into t')) return Promise.reject(new Error('db error'));
            if (sql === 'rollback') return Promise.reject(new Error('rollback error'));
            return Promise.resolve(makeQueryResult([]));
        });
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => [
                    { sql: 'insert into t (id) values ($1)', params: [1] },
                ]),
            'uid-1'),
        ).rejects.toThrow('db error');
    });

    it('still returns results correctly when rowCount is null or undefined (pg quirk)', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([])); 
        tx._clientQuery.mockResolvedValueOnce(makeQueryResult([]));
        tx._clientQuery.mockResolvedValueOnce(makeQueryResult([])); 
        tx._clientQuery.mockResolvedValueOnce(makeQueryResult([]));
        tx._clientQuery.mockResolvedValueOnce({ rows: [] } as unknown as { rows: unknown[]; rowCount: number });
        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'update t set x = $1 where false', params: ['y'] },
            ]),
        'uid-1');
        expect(result).toEqual([{ rows: [], rowCount: null }]);
    });

    it('falls back to empty array if query results rows is undefined', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        tx._clientQuery
            .mockResolvedValueOnce(makeQueryResult([]))
            .mockResolvedValueOnce(makeQueryResult([]))
            .mockResolvedValueOnce(makeQueryResult([]))
            .mockResolvedValueOnce({ rows: undefined } as unknown as { rows: unknown[]; rowCount: number });
        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'update t set x = $1 where false', params: ['y'] },
            ]),
        'uid-1');
        expect(result).toEqual([{ rows: [], rowCount: null }]);
    });

    it('lazily wraps non-select queries in a transaction if executed first without explicit batch', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('insert into items (id) values (1)');
        }, 'uid-1');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        expect(calls).toEqual([
            'begin',
            `select set_config('request.jwt.claims', $1, true)`,
            'set local role "authenticated"',
            'insert into items (id) values (1)',
            'commit',
            'reset role',
        ]);
    });

    it('ignores explicit commit/rollback if not in a transaction', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) {
                await client.query('commit');
                await client.query('rollback');
            }
        }, 'uid-1');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        // no transaction opened → only the finally reset role fires
        expect(calls).toEqual(['reset role']);
    });

    it('intercepts explicit begin if session already initialized', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) {
                await client.query('select 1');
                await client.query('begin');
                await client.query('begin');
            }
        }, 'uid-1');
        const calls = tx._clientQuery.mock.calls.map((c) => c[0]);
        // select 1 opens begin+identity; second begin is a no-op (already in tx);
        // the outer finally commits and resets role.
        expect(calls).toEqual([
            'begin',
            `select set_config('request.jwt.claims', $1, true)`,
            'set local role "authenticated"',
            '/* uid:uid-1 */ select 1',
            'commit',
            'reset role',
        ]);
    });

    it('handles function and non-function property access on client proxy', async () => {
        // Ensure the mock returns a real promise so the finally reset role .catch() works
        tx._clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { foo: string; otherMethod: () => void } }).client;
            expect(client.foo).toBeUndefined();
            expect(typeof client.otherMethod).toBe('function');
            client.otherMethod();
        }, 'uid-1');
    });
});



describe('withUserDb session-state race', () => {
    it('does not run a query before session state finished applying', async () => {
        const order: string[] = [];
        tx._clientQuery.mockImplementation(async (sql: string) => {
            order.push(sql);
            await new Promise((r) => setTimeout(r, 5));
            return { rows: [], rowCount: 0 };
        });

        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            await Promise.all([client.query('select 1'), client.query('select 2')]);
            return 'ok';
        }, 'uid-race');

        const setRoleAt = order.findIndex((s) => s.startsWith('set local role'));
        const select2At = order.findIndex((s) => s.includes('select 2'));
        expect(select2At).toBeGreaterThan(setRoleAt);
    });

    it('retries session state when the first attempt fails', async () => {
        let failed = false;
        tx._clientQuery.mockImplementation(async (sql: string) => {
            if (sql.startsWith('select set_config') && !failed) {
                failed = true;
                throw new Error('transient');
            }
            return { rows: [], rowCount: 0 };
        });

        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            await client.query('select 1').catch(() => undefined);
            await client.query('select 2');
            return 'ok';
        }, 'uid-fail');

        const calls = tx._clientQuery.mock.calls.map((c: unknown[]) => c[0]);
        expect(calls.filter((s: string) => s.startsWith('set local role')).length).toBeGreaterThan(0);
    });

    it('surfaces the session-state failure even when the cleanup rollback also fails', async () => {
        tx._clientQuery.mockImplementation(async (sql: string) => {
            if (sql.startsWith('select set_config')) throw new Error('transient');
            if (sql === 'rollback') throw new Error('rollback error');
            return { rows: [], rowCount: 0 };
        });

        await expect(
            withUserDb(async (db) => {
                const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
                await client.query('select 1');
                return 'ok';
            }, 'uid-fail-rollback'),
        ).rejects.toThrow('transient');
    });

    it('does not fail the call when the final `reset role` cleanup itself fails', async () => {
        tx._clientQuery.mockImplementation(async (sql: string) => {
            if (sql === 'reset role') throw new Error('connection already gone');
            return { rows: [], rowCount: 0 };
        });

        await expect(
            withUserDb(async (db) => {
                const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
                await client.query('select 1');
                return 'ok';
            }, 'uid-reset-fail'),
        ).resolves.toBe('ok');
    });

    it('surfaces the callback error when the outer rollback cleanup also fails', async () => {
        tx._clientQuery.mockImplementation(async (sql: string) => {
            if (sql === 'rollback') throw new Error('rollback error');
            return { rows: [], rowCount: 0 };
        });

        await expect(
            withUserDb(async (db) => {
                const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
                await client.query('insert into users (id) values (1)');
                throw new Error('callback failed');
            }, 'uid-rollback-fail'),
        ).rejects.toThrow('callback failed');
    });
});

describe('withUserDb role safety', () => {
    it('escapes a role claim containing a double quote instead of injecting SQL', async () => {
        config.firebaseAuth = {};
        config.db = { connectionString: 'postgresql://x' };
        getAuthUser.mockResolvedValue({
            user: { uid: 'u', getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'x" ; set role "postgres' } }) },
            loading: false,
        });

        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            await client.query('select 1');
            return 'ok';
        }, 'uid-inj');

        const calls = tx._clientQuery.mock.calls.map((c: unknown[]) => c[0]);
        const setRole = calls.find((s: string) => typeof s === 'string' && s.startsWith('set local role'));
        expect(setRole).toBe('set local role "x"" ; set role ""postgres"');
    });
});

describe('resolveUserDbCredentials', () => {
    it('reads uid, token and role claim from the signed-in Firebase user', async () => {
        config.firebaseAuth = {};
        getAuthUser.mockResolvedValue({
            user: {
                uid: 'firebase-uid',
                getIdToken: vi.fn().mockResolvedValue('firebase-jwt'),
                getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'technician' } }),
            },
            loading: false,
        });

        await expect(resolveUserDbCredentials()).resolves.toEqual({
            uid: 'firebase-uid',
            accessToken: 'firebase-jwt',
            role: 'technician',
        });
    });

    it('returns nulls rather than throwing when nobody is signed in', async () => {
        config.firebaseAuth = {};
        getAuthUser.mockResolvedValue({ user: null, loading: false });

        await expect(resolveUserDbCredentials()).resolves.toEqual({ uid: null, accessToken: null, role: null });
    });

    it('prefers the configured resolvers over the Firebase session', async () => {
        config.firebaseAuth = {};
        config.db = {
            connectionString: 'postgresql://x',
            authenticatedRoleClaim: false,
            getUserId: () => 'config-uid',
            getAccessToken: () => 'config-jwt',
        };

        await expect(resolveUserDbCredentials()).resolves.toEqual({ uid: 'config-uid', accessToken: 'config-jwt', role: null });
        expect(getAuthUser).not.toHaveBeenCalled();
    });
});

describe('withUserDb with resolved credentials', () => {
    it('uses the passed uid and role without touching the request', async () => {
        config.firebaseAuth = {};
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, { uid: 'passed-uid', accessToken: 'passed-jwt', role: 'technician' });

        expect(getAuthUser).not.toHaveBeenCalled();
        expect(tx._clientQuery).toHaveBeenCalledWith(
            `select set_config('request.jwt.claims', $1, true)`,
            [JSON.stringify({ sub: 'passed-uid' })],
        );
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "technician"');
    });

    it('falls back to the default role when the credentials carry none', async () => {
        config.firebaseAuth = {};
        await withUserDb(async (db) => {
            const client = (db as unknown as { client: { query: (sql: unknown) => Promise<unknown> } }).client;
            if (client) await client.query('select 1');
            return 'ok';
        }, { uid: 'passed-uid', accessToken: null, role: null });

        expect(getAuthUser).not.toHaveBeenCalled();
        expect(tx._clientQuery).toHaveBeenCalledWith('set local role "authenticated"');
    });

    it('sends the passed access token in Supabase mode', async () => {
        config.firebaseAuth = {};
        config.db = { supabase: { url: 'https://p.supabase.co', anonKey: 'anon' } };

        await withUserDb(async () => 'ok', { uid: 'passed-uid', accessToken: 'passed-jwt', role: null });

        expect(getAuthUser).not.toHaveBeenCalled();
        expect(proxyDrizzle).toHaveBeenCalledTimes(1);
    });

    it('names the missing field when credentials come back empty', async () => {
        config.firebaseAuth = {};
        await expect(withUserDb(async () => 'ok', { uid: null, accessToken: null, role: null }))
            .rejects.toThrow(/without a user id/);
    });
});
