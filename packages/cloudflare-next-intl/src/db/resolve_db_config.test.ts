import { describe, it, expect, vi } from 'vitest';
import type { DbRoutingConfig } from '../types/types.js';
import resolveDbConfig from './resolve_db_config.js';

describe('resolveDbConfig', () => {
    it('returns an unset db and no resolveAuthUser when @intl-config has neither db nor firebaseAuth set', async () => {
        const config = await resolveDbConfig();
        expect(config.db).toBeUndefined();
        expect(config.resolveAuthUser).toBeUndefined();
    });

    it('overrides the db block onto the @intl-config config', async () => {
        const dbOverride: DbRoutingConfig = { connectionString: 'postgresql://localhost:5432/postgres' };
        const config = await resolveDbConfig(dbOverride);
        expect(config.db).toBe(dbOverride);
    });

    it('falls back to a bare config when @intl-config is not set and an override is given', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        const { default: resolveDbConfigStandalone } = await import('./resolve_db_config.js');
        const dbOverride: DbRoutingConfig = { connectionString: 'postgresql://localhost:5432/postgres' };
        const config = await resolveDbConfigStandalone(dbOverride);
        expect(config.db).toBe(dbOverride);
        expect(config.resolveAuthUser).toBeUndefined();
        vi.doUnmock('@intl-config');
        vi.resetModules();
    });

    it('returns an unset db and no resolveAuthUser when @intl-config is not set and no override is given', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        const { default: resolveDbConfigStandalone } = await import('./resolve_db_config.js');
        const config = await resolveDbConfigStandalone();
        expect(config.db).toBeUndefined();
        expect(config.resolveAuthUser).toBeUndefined();
        vi.doUnmock('@intl-config');
        vi.resetModules();
    });

    it('builds a resolveAuthUser callback when @intl-config has firebaseAuth set, resolving the signed-in user', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: { locales: ['en'], defaultLocale: 'en', firebaseAuth: {} } }));
        const getIdToken = vi.fn(async () => 'id-token');
        const getIdTokenResult = vi.fn(async () => ({ claims: { role: 'editor' } }));
        vi.doMock('../firebase_auth/server/use_auth_user_server.js', () => ({
            getAuthUser: async () => ({ user: { uid: 'firebase-uid', getIdToken, getIdTokenResult }, loading: false }),
        }));
        const { default: resolveDbConfigWithAuth } = await import('./resolve_db_config.js');
        const config = await resolveDbConfigWithAuth();
        expect(config.resolveAuthUser).toBeTypeOf('function');
        const resolved = await config.resolveAuthUser!();
        expect(resolved?.uid).toBe('firebase-uid');
        await expect(resolved!.getIdToken()).resolves.toBe('id-token');
        await expect(resolved!.getIdTokenResult()).resolves.toEqual({ claims: { role: 'editor' } });
        vi.doUnmock('@intl-config');
        vi.doUnmock('../firebase_auth/server/use_auth_user_server.js');
        vi.resetModules();
    });

    it('resolveAuthUser resolves null when firebaseAuth is configured but no user is signed in', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: { locales: ['en'], defaultLocale: 'en', firebaseAuth: {} } }));
        vi.doMock('../firebase_auth/server/use_auth_user_server.js', () => ({
            getAuthUser: async () => ({ user: null, loading: false }),
        }));
        const { default: resolveDbConfigWithAuth } = await import('./resolve_db_config.js');
        const config = await resolveDbConfigWithAuth();
        await expect(config.resolveAuthUser!()).resolves.toBeNull();
        vi.doUnmock('@intl-config');
        vi.doUnmock('../firebase_auth/server/use_auth_user_server.js');
        vi.resetModules();
    });
});
