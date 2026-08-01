import type { FirebaseApp } from 'firebase/app';
import type { User } from 'firebase/auth';
/**
 * Resolves the signed-in user on the server from the session cookie.
 * `initializeServerApp` validates the token with the Auth service, so a
 * missing, expired, or forged token yields `currentUser === null`.
 * Wrapped in React's `cache()` so multiple server components in one request
 * share a single Auth service lookup. Lazily imports `firebase/app`/
 * `firebase/auth` — never touched unless this is actually called, and
 * throws if `firebaseAuth` is missing from `RoutingConfig`.
 */
export declare const getAuthenticatedAppForUser: () => Promise<{
    firebaseServerApp: FirebaseApp | null;
    currentUser: User | null;
}>;
