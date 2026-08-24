import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config, proxyDrizzle, proxyDb, runTransactionBatch } = vi.hoisted(() => {
    const clientQuery = vi.fn();
    // The raw pg client — shared between tx.session.client (inside a Drizzle
    // transaction) and the top-level connectToPostgres return value, so both
    // withUserDb and withPublicDb route through the same tracked query mock.
    const pgClient = { query: clientQuery };
    const tx = {
        execute: vi.fn(async () => undefined),
        session: { client: pgClient },
        _clientQuery: clientQuery, // exposed for test assertions
    };
    const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const connectToPostgres = vi.fn().mockResolvedValue(pgClient);
    const disconnectPostgres = vi.fn();
    const getAuthUser = vi.fn().mockResolvedValue({ user: { uid: 'firebase-uid', getIdToken: vi.fn().mockResolvedValue('firebase-jwt') }, loading: false });
    const config: Record<string, unknown> = { locales: ['en'], defaultLocale: 'en', db: { connectionString: 'postgresql://x' } };
    const proxyDb = { select: vi.fn(), execute: vi.fn() };
    const proxyDrizzle = vi.fn(() => proxyDb);
    const runTransactionBatch = vi.fn();
    return { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config, proxyDrizzle, proxyDb, runTransactionBatch };
});


vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({ transaction, select: vi.fn() })) }));
vi.mock('drizzle-orm/pg-proxy', () => ({ drizzle: proxyDrizzle }));
vi.mock('./connection', () => ({ default: connectToPostgres, disconnectPostgres, resetConnectionState: vi.fn() }));
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));
vi.mock('../config/intl_config', () => ({ default: config }));
vi.mock('./transaction_batch', () => ({ default: runTransactionBatch }));

import { withPublicDb, withUserDb } from './context';

beforeEach(() => {
    tx.execute.mockClear();
    tx._clientQuery.mockClear();
    disconnectPostgres.mockClear();
    connectToPostgres.mockClear();
    proxyDrizzle.mockClear();
    transaction.mockClear();
    runTransactionBatch.mockReset();
    config.db = { connectionString: 'postgresql://x' };
    config.firebaseAuth = undefined;
});

describe('withPublicDb', () => {
    it('runs the callback with a drizzle db and always disconnects', async () => {
        const result = await withPublicDb(async (db) => { expect(db).toBeDefined(); return 42; });
        expect(result).toBe(42);
        expect(disconnectPostgres).toHaveBeenCalledTimes(1);
    });

    it('disconnects even when the callback throws', async () => {
        await expect(withPublicDb(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(disconnectPostgres).toHaveBeenCalledTimes(1);
    });

    it('throws when db config is missing', async () => {
        config.db = undefined;
        await expect(withPublicDb(async () => 1)).rejects.toThrow(/`db` is not set/);
    });
});

describe('withUserDb', () => {
    it('sets jwt claims and role inside a transaction for an explicit uid', async () => {
        await withUserDb(async () => 'ok', 'uid-1');
        expect(tx.execute).toHaveBeenCalledTimes(2);
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

    it('sets custom authenticated role if configured', async () => {
        config.db = { connectionString: 'postgresql://x', authenticatedRole: 'custom_role' };
        await withUserDb(async () => 'ok', 'uid-1');
        expect(tx.execute).toHaveBeenCalledTimes(2);
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

    it('withPublicDb never opens a postgres connection', async () => {
        const result = await withPublicDb(async (db) => { expect(db).toBe(proxyDb); return 7; });
        expect(result).toBe(7);
        expect(connectToPostgres).not.toHaveBeenCalled();
        expect(disconnectPostgres).not.toHaveBeenCalled();
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

    it('withUserDb runs without a drizzle transaction', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' }, getAccessToken: () => 'user-jwt' };
        const result = await withUserDb(async (db) => { expect(db).toBe(proxyDb); return 'ok'; });
        expect(result).toBe('ok');
        expect(transaction).not.toHaveBeenCalled();
        expect(tx.execute).not.toHaveBeenCalled();
    });

    it('withUserDb surfaces a missing access token', async () => {
        config.db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' }, getAccessToken: () => null };
        await expect(withUserDb(async () => 'ok')).rejects.toThrow(/access token/i);
    });

    it('still routes to postgres when a connection string is also set', async () => {
        config.db = { connectionString: 'postgresql://x', supabase: {} };
        await withPublicDb(async () => 1);
        expect(connectToPostgres).toHaveBeenCalledTimes(1);
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
                expect(() => (build as unknown as { select: () => void }).select()).toThrow(/for building statements only/);
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
});

/**
 * REGRESSION: before the fix, `db.transaction(build)` in postgres/Hyperdrive
 * mode fell through to Drizzle's native savepoint which returned the array of
 * `.toSQL()` objects unexecuted instead of the actual row results.
 *
 * These tests first reproduce the failure shape (the bug) and then confirm
 * the fix: `session.client.query` is called for each query and `ExecResult[]`
 * is returned to the caller.
 */
describe('db.transaction() in Postgres/Hyperdrive mode — regression', () => {
    interface BatchDb { transaction: (build: (db: unknown) => unknown) => Promise<unknown> }

    // Stub session.client.query to return realistic pg result objects.
    const makeQueryResult = (rows: unknown[], rowCount = rows.length) => ({ rows, rowCount });

    beforeEach(() => {
        tx._clientQuery.mockReset();
        config.db = { connectionString: 'postgresql://x' };
    });

    it('withUserDb: db.transaction() executes each query via session.client.query and returns ExecResult[]', async () => {
        tx._clientQuery
            .mockResolvedValueOnce(makeQueryResult([{ id: 1 }]))
            .mockResolvedValueOnce(makeQueryResult([], 1));

        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t where id = $1', params: [1] },
                { sql: 'insert into t (val) values ($1)', params: ['x'] },
            ]),
        'uid-1');

        // Fix: session.client.query was called for each of the two queries.
        expect(tx._clientQuery).toHaveBeenCalledTimes(2);
        // Fix: caller gets ExecResult[] not raw toSQL objects.
        expect(result).toEqual([
            { rows: [{ id: 1 }], rowCount: 1 },
            { rows: [], rowCount: 1 },
        ]);
    });

    it('withPublicDb: db.transaction() executes each query via session.client.query and returns ExecResult[]', async () => {
        tx._clientQuery.mockResolvedValueOnce(makeQueryResult([['row1'], ['row2']]));

        const result = await withPublicDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t', params: [] },
            ]),
        );

        expect(tx._clientQuery).toHaveBeenCalledTimes(1);
        expect(result).toEqual([{ rows: [['row1'], ['row2']], rowCount: 2 }]);
    });

    it('the build callback in postgres mode also receives a build-only handle that throws on execute', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));
        await withUserDb((db) =>
            (db as unknown as BatchDb).transaction((buildDb) => {
                // buildOnlyDb proxy should throw on any property access that leads to execution.
                expect(() => (buildDb as unknown as { select: () => void }).select()).toThrow(/for building statements only/);
                return [];
            }),
        'uid-1');
    });

    it('executes queries in order and forwards correct sql/params after inlining', async () => {
        tx._clientQuery.mockResolvedValue(makeQueryResult([]));

        await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'insert into a (x) values ($1)', params: [42] },
                { sql: 'insert into b (y) values ($1)', params: ['hello'] },
            ]),
        'uid-1');

        const calls = tx._clientQuery.mock.calls as [string][];
        expect(calls).toHaveLength(2);
        // inlineParams replaces $1 with literal value
        expect(calls[0][0]).toContain('42');
        expect(calls[1][0]).toContain("'hello'");
    });

    it('propagates a pg client error and the caller sees the failure', async () => {
        tx._clientQuery.mockRejectedValue(new Error('duplicate key value'));
        await expect(
            withUserDb((db) =>
                (db as unknown as BatchDb).transaction(() => [
                    { sql: 'insert into t (id) values ($1)', params: [1] },
                ]),
            'uid-1'),
        ).rejects.toThrow(/duplicate key value/);
    });

    it('still returns results correctly when rowCount is null (pg quirk)', async () => {
        tx._clientQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'update t set x = $1 where false', params: ['y'] },
            ]),
        'uid-1');
        expect(result).toEqual([{ rows: [], rowCount: null }]);
    });

    it('falls back to the top-level client when session.client is undefined on transaction handle', async () => {
        // Temporarily delete session.client to trigger the fallback
        const originalSession = tx.session;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx as any).session = undefined;

        tx._clientQuery.mockResolvedValueOnce(makeQueryResult([{ id: 99 }]));

        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t', params: [] },
            ]),
        'uid-1');

        // Restore mock session
        tx.session = originalSession;

        expect(tx._clientQuery).toHaveBeenCalledTimes(1);
        expect(result).toEqual([{ rows: [{ id: 99 }], rowCount: 1 }]);
    });

    it('falls back to empty array if query results rows is undefined', async () => {
        tx._clientQuery.mockResolvedValueOnce({ rows: undefined as any, rowCount: 0 });

        const result = await withUserDb((db) =>
            (db as unknown as BatchDb).transaction(() => [
                { sql: 'select id from t', params: [] },
            ]),
        'uid-1');

        expect(result).toEqual([{ rows: [], rowCount: 0 }]);
    });
});

