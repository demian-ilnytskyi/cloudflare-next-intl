import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config, proxyDrizzle, proxyDb } = vi.hoisted(() => {
    const tx = { execute: vi.fn(async () => undefined) };
    const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const connectToPostgres = vi.fn().mockResolvedValue({});
    const disconnectPostgres = vi.fn();
    const getAuthUser = vi.fn().mockResolvedValue({ user: { uid: 'firebase-uid', getIdToken: vi.fn().mockResolvedValue('firebase-jwt') }, loading: false });
    const config: Record<string, unknown> = { locales: ['en'], defaultLocale: 'en', db: { connectionString: 'postgresql://x' } };
    const proxyDb = { select: vi.fn(), execute: vi.fn() };
    const proxyDrizzle = vi.fn(() => proxyDb);
    return { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config, proxyDrizzle, proxyDb };
});

vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({ transaction, select: vi.fn() })) }));
vi.mock('drizzle-orm/pg-proxy', () => ({ drizzle: proxyDrizzle }));
vi.mock('./connection', () => ({ default: connectToPostgres, disconnectPostgres, resetConnectionState: vi.fn() }));
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));
vi.mock('../config/intl_config', () => ({ default: config }));

import { withPublicDb, withUserDb } from './context';

beforeEach(() => {
    tx.execute.mockClear();
    disconnectPostgres.mockClear();
    connectToPostgres.mockClear();
    proxyDrizzle.mockClear();
    transaction.mockClear();
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
