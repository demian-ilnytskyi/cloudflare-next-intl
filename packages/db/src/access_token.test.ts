import { describe, it, expect } from 'vitest';
import resolveAccessToken from './access_token.js';
import type { DbConfig } from './types.js';

describe('resolveAccessToken', () => {
    it('throws when db is not configured', async () => {
        await expect(resolveAccessToken({})).rejects.toThrow(/db.*not.*configured|db: /i);
    });

    it('returns db.getAccessToken() when it resolves a token', async () => {
        const config: DbConfig = { db: { getAccessToken: () => 'token-from-config' } };
        expect(await resolveAccessToken(config)).toBe('token-from-config');
    });

    it('falls back to resolveAuthUser when getAccessToken is unset', async () => {
        const config: DbConfig = {
            db: {},
            resolveAuthUser: async () => ({
                uid: 'u1',
                getIdToken: async () => 'token-from-auth-user',
                getIdTokenResult: async () => ({ claims: {} }),
            }),
        };
        expect(await resolveAccessToken(config)).toBe('token-from-auth-user');
    });

    it('throws when neither getAccessToken nor resolveAuthUser yields a token', async () => {
        const config: DbConfig = { db: {}, resolveAuthUser: async () => null };
        await expect(resolveAccessToken(config)).rejects.toThrow(
            /could not resolve an access token/,
        );
    });

    it('throws when resolveAuthUser is unset and getAccessToken yields nothing', async () => {
        const config: DbConfig = { db: {} };
        await expect(resolveAccessToken(config)).rejects.toThrow(
            /could not resolve an access token/,
        );
    });
});
