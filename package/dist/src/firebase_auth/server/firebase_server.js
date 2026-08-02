import { cookies } from 'next/headers';
import { cache } from 'react';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { defaultSessionCookieName } from '../middleware/update_session';
let baseApp;
/**
 * Resolves the signed-in user on the server from the session cookie.
 * `initializeServerApp` validates the token with the Auth service, so a
 * missing, expired, or forged token yields `currentUser === null`.
 * Wrapped in React's `cache()` so multiple server components in one request
 * share a single Auth service lookup. Lazily imports `firebase/app`/
 * `firebase/auth` — never touched unless this is actually called, and
 * throws if `firebaseAuth` is missing from `RoutingConfig`.
 */
export const getAuthenticatedAppForUser = cache(async function getAuthenticatedAppForUser() {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const authIdToken = (await cookies()).get(sessionCookieName)?.value;
    if (!authIdToken) {
        return { firebaseServerApp: null, currentUser: null };
    }
    try {
        const { initializeApp, initializeServerApp } = await import('firebase/app');
        const { getAuth } = await import('firebase/auth');
        const firebaseConfig = {
            apiKey: fa.apiKey,
            authDomain: fa.authDomain,
            projectId: fa.projectId,
            storageBucket: fa.storageBucket,
            messagingSenderId: fa.messagingSenderId,
            appId: fa.appId,
            measurementId: fa.measurementId,
        };
        // One shared base app per process (keyed by nothing but existence —
        // a single RoutingConfig means a single Firebase project), not one
        // named app per token: `initializeServerApp` derives a distinct,
        // token-scoped auth context from this same base app without
        // registering a new named app in Firebase's global app registry.
        if (!baseApp)
            baseApp = initializeApp(firebaseConfig, 'firebase-auth-server-base');
        const firebaseServerApp = initializeServerApp(baseApp, { authIdToken });
        const auth = getAuth(firebaseServerApp);
        await auth.authStateReady();
        return { firebaseServerApp, currentUser: auth.currentUser };
    }
    catch {
        return { firebaseServerApp: null, currentUser: null };
    }
});
