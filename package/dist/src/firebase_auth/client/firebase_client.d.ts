import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { FirebasePerformance } from 'firebase/performance';
/**
 * Current App Check token, or `undefined` if `appCheck` isn't configured or
 * hasn't initialized yet. Forces a refresh only when the cached token is
 * expired/near-expiry — mirrors `getToken`'s own semantics, just exposed
 * here so callers (e.g. `AuthUserProvider`'s session-cookie sync) don't need
 * to import `firebase/app-check` themselves.
 */
export declare function getAppCheckToken(): Promise<string | undefined>;
/**
 * Lazily loads and initializes `firebase/app`/`firebase/auth` — a dynamic
 * import, not a static one, so consumers who never call a firebase_auth
 * export never pull these packages into their bundle or runtime at all.
 * Throws if `firebaseAuth` is missing from `RoutingConfig` (see
 * `require_config.ts`) instead of silently no-op'ing.
 */
export declare function getFirebaseAuthClient(): Promise<{
    app: FirebaseApp;
    auth: Auth;
}>;
/** Synchronous read of the cached client, or `undefined` before the first `getFirebaseAuthClient()` resolves. */
export declare function getFirebaseAuthClientSync(): {
    app: FirebaseApp;
    auth: Auth;
} | undefined;
/** Synchronous read of the cached `FirebasePerformance` instance, or `undefined` if `performance` isn't enabled or hasn't initialized yet. */
export declare function getFirebasePerformanceSync(): FirebasePerformance | undefined;
/** Memoized `import('firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export declare function getFirebaseAuthModule(): Promise<typeof import('firebase/auth')>;
