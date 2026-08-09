import { cookies } from 'next/headers';
import { cache } from 'react';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { defaultAppCheckTokenCookieName, defaultSessionCookieName } from '../middleware/update_session';
import reportError from '../../error_handling/report_error';
import mintServerAppCheckToken from './mint_server_app_check_token';
let baseApp;
let firebaseAppModule;
let firebaseAuthModule;
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
    const appCheckTokenCookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const cookieStore = await cookies();
    const authIdToken = cookieStore.get(sessionCookieName)?.value;
    if (!authIdToken) {
        return { firebaseServerApp: null, currentUser: null };
    }
    // Only meaningful when `appCheck` is configured — if App Check
    // enforcement is on for Auth in the Firebase console, `initializeServerApp`
    // rejects with `auth/firebase-app-check-token-is-invalid` unless this is
    // supplied. Absent when App Check isn't configured, which is fine:
    // `initializeServerApp` simply skips App Check validation in that case.
    //
    // The client-written cookie is the fast path (no round-trip) but can be
    // missing on a cold navigation — a fresh tab/hard-refresh renders on the
    // server BEFORE `AuthUserProvider` has had a chance to run and write it,
    // even though `authIdToken` above proves this is a genuinely signed-in
    // user. Falling straight through to `initializeServerApp` with no App
    // Check token in that case would reject the whole lookup and render the
    // page as signed-out. Minting one server-side (service-account-backed,
    // see `mintServerAppCheckToken`) closes that gap; it's a no-op returning
    // `undefined` if `appCheck.clientEmail`/`privateKey`/`appId` aren't set,
    // so apps that never configure server-side minting keep today's exact
    // behavior.
    const appCheckToken = cookieStore.get(appCheckTokenCookieName)?.value
        ?? await mintServerAppCheckToken(fa.projectId, fa.appCheck);
    try {
        if (!firebaseAppModule)
            firebaseAppModule = await import('firebase/app');
        if (!firebaseAuthModule)
            firebaseAuthModule = await import('firebase/auth');
        const { initializeApp, initializeServerApp } = firebaseAppModule;
        const { getAuth } = firebaseAuthModule;
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
        const firebaseServerApp = initializeServerApp(baseApp, { authIdToken, appCheckToken });
        const auth = getAuth(firebaseServerApp);
        await auth.authStateReady();
        return { firebaseServerApp, currentUser: auth.currentUser };
    }
    catch (error) {
        await reportError(config, { error, classOrMethodName: 'getAuthenticatedAppForUser' });
        return { firebaseServerApp: null, currentUser: null };
    }
});
