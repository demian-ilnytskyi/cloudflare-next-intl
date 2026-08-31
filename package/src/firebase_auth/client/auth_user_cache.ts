import type { AuthUser } from '../types.js';

// Module-scope cache so non-React code can read the current client auth
// user synchronously, without needing to be inside AuthUserProvider's tree.
let cachedUser: AuthUser | null = null;
let cachedLoading = true;

export function setAuthUserCache(user: AuthUser | null): void {
    cachedUser = user;
    cachedLoading = false;
}

export function getAuthUserCache(): AuthUser | null {
    return cachedUser;
}

export function isAuthUserLoadingCache(): boolean {
    return cachedLoading;
}
