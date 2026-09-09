import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAuthUserCache, getAuthUserCache, isAuthUserLoadingCache } from './auth_user_cache.js';

describe('auth_user_cache', () => {
    beforeEach(() => {
        setAuthUserCache(null);
    });

    it('starts as loading with no cached user before any set call', async () => {
        vi.resetModules();
        const mod = await import('./auth_user_cache.js');
        expect(mod.isAuthUserLoadingCache()).toBe(true);
        expect(mod.getAuthUserCache()).toBeNull();
    });

    it('stores and returns the given user', () => {
        const user = { uid: '123' } as ReturnType<typeof getAuthUserCache>;
        setAuthUserCache(user);
        expect(getAuthUserCache()).toBe(user);
    });

    it('marks loading as false once a user (including null) has been set', () => {
        setAuthUserCache(null);
        expect(isAuthUserLoadingCache()).toBe(false);
    });
});
