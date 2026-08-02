import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
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
/** Memoized `import('firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export declare function getFirebaseAuthModule(): Promise<typeof import('firebase/auth')>;
