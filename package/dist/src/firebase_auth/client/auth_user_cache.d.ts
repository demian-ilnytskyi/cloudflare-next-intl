import type { AuthUser } from '../types.js';
export declare function setAuthUserCache(user: AuthUser | null): void;
export declare function getAuthUserCache(): AuthUser | null;
export declare function isAuthUserLoadingCache(): boolean;
