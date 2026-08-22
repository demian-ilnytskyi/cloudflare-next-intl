import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config } = vi.hoisted(() => {
    const tx = { execute: vi.fn(async () => undefined) };
    const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const connectToPostgres = vi.fn().mockResolvedValue({});
    const disconnectPostgres = vi.fn();
    const getAuthUser = vi.fn().mockResolvedValue({ user: { uid: 'firebase-uid' }, loading: false });
    const config: Record<string, unknown> = { locales: ['en'], defaultLocale: 'en', db: { connectionString: 'postgresql://x' } };
    return { tx, transaction, connectToPostgres, disconnectPostgres, getAuthUser, config };
});

vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({ transaction, select: vi.fn() })) }));
vi.mock('./connection', () => ({ default: connectToPostgres, disconnectPostgres, resetConnectionState: vi.fn() }));
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));
vi.mock('../config/intl_config', () => ({ default: config }));

import { withPublicContext, withUserContext } from './context';

beforeEach(() => {
    tx.execute.mockClear();
    disconnectPostgres.mockClear();
    config.db = { connectionString: 'postgresql://x' };
    config.firebaseAuth = undefined;
});

describe('withPublicContext', () => {
    it('runs the callback with a drizzle db and always disconnects', async () => {
        const result = await withPublicContext(async (db) => { expect(db).toBeDefined(); return 42; });
        expect(result).toBe(42);
        expect(disconnectPostgres).toHaveBeenCalledTimes(1);
    });

    it('disconnects even when the callback throws', async () => {
        await expect(withPublicContext(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(disconnectPostgres).toHaveBeenCalledTimes(1);
    });

    it('throws when db config is missing', async () => {
        config.db = undefined;
        await expect(withPublicContext(async () => 1)).rejects.toThrow(/`db` is not set/);
    });
});

describe('withUserContext', () => {
    it('sets jwt claims and role inside a transaction for an explicit uid', async () => {
        await withUserContext(async () => 'ok', 'uid-1');
        expect(tx.execute).toHaveBeenCalledTimes(2);
    });

    it('falls back to the firebase auth user when no uid is given', async () => {
        config.firebaseAuth = { apiKey: 'k' };
        await withUserContext(async () => 'ok');
        expect(getAuthUser).toHaveBeenCalled();
    });

    it('prefers db.getUserId over the firebase user', async () => {
        const getUserId = vi.fn().mockResolvedValue('custom-uid');
        config.db = { connectionString: 'postgresql://x', getUserId };
        await withUserContext(async () => 'ok');
        expect(getUserId).toHaveBeenCalled();
    });

    it('throws when no uid can be resolved', async () => {
        await expect(withUserContext(async () => 'ok')).rejects.toThrow(/user id/i);
    });

    it('throws when db config is missing', async () => {
        config.db = undefined;
        await expect(withUserContext(async () => 'ok')).rejects.toThrow(/`db` is not set/);
    });
});
