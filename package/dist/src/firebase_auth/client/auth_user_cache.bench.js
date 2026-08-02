import { bench, describe } from 'vitest';
import { setAuthUserCache, getAuthUserCache, isAuthUserLoadingCache } from './auth_user_cache';
describe('auth_user_cache', () => {
    bench('setAuthUserCache + getAuthUserCache round-trip', () => {
        setAuthUserCache({ uid: 'bench-user' });
        getAuthUserCache();
    });
    bench('isAuthUserLoadingCache read', () => {
        isAuthUserLoadingCache();
    });
});
