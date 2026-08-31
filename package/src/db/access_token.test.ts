import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getAuthUser, getIdToken } = vi.hoisted(() => {
    const getIdToken = vi.fn().mockResolvedValue('firebase-jwt');
    const getAuthUser = vi.fn().mockResolvedValue({ user: { getIdToken }, loading: false });
    return { getAuthUser, getIdToken };
});
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));

import resolveAccessToken from './access_token.js';

const base = { locales: ['en'] as const, defaultLocale: 'en' };

beforeEach(() => {
    getAuthUser.mockClear();
    getIdToken.mockClear();
    getAuthUser.mockResolvedValue({ user: { getIdToken }, loading: false });
});

describe('resolveAccessToken', () => {
    it('throws when db config is missing', async () => {
        await expect(resolveAccessToken({ ...base } as never)).rejects.toThrow(/`db` is not set/);
    });

    it('prefers db.getAccessToken', async () => {
        const getAccessToken = vi.fn().mockResolvedValue('config-jwt');
        const config = { ...base, db: { supabase: {}, getAccessToken } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('config-jwt');
        expect(getAuthUser).not.toHaveBeenCalled();
    });

    it('accepts a synchronous getAccessToken', async () => {
        const config = { ...base, db: { supabase: {}, getAccessToken: () => 'sync-jwt' } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('sync-jwt');
    });

    it('falls back to the firebase id token', async () => {
        const config = { ...base, db: { supabase: {} }, firebaseAuth: { apiKey: 'k' } } as never;
        await expect(resolveAccessToken(config)).resolves.toBe('firebase-jwt');
        expect(getIdToken).toHaveBeenCalledWith(false);
    });

    it('throws when getAccessToken returns nothing and firebase is absent', async () => {
        const config = { ...base, db: { supabase: {}, getAccessToken: () => null } } as never;
        await expect(resolveAccessToken(config)).rejects.toThrow(/access token/i);
    });

    it('throws when firebase is configured but nobody is signed in', async () => {
        getAuthUser.mockResolvedValue({ user: null, loading: false });
        const config = { ...base, db: { supabase: {} }, firebaseAuth: { apiKey: 'k' } } as never;
        await expect(resolveAccessToken(config)).rejects.toThrow(/access token/i);
    });
});
