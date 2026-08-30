import type { FirebaseApp } from 'firebase/app';
import type * as FirebaseAppModule from 'firebase/app';
import type { User } from 'firebase/auth';
import type * as FirebaseAuthModule from 'firebase/auth';
import { cookies } from 'next/headers';
import { cache } from 'react';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { defaultAppCheckTokenCookieName, defaultRefreshTokenCookieName, defaultSessionCookieName, isIdTokenExpired, refreshIdToken, sessionCookieOptions } from '../middleware/update_session.js';
import reportError from '../../error_handling/report_error.js';
import mintServerAppCheckToken from './mint_server_app_check_token.js';

let baseAppReady: Promise<FirebaseApp> | undefined;
let firebaseAppModuleReady: Promise<typeof FirebaseAppModule> | undefined;
let firebaseAuthModuleReady: Promise<typeof FirebaseAuthModule> | undefined;

/**
 * Writes a freshly-minted session/refresh pair back to the cookie jar so the
 * NEXT request doesn't repeat the rejected-token round-trip. Next only allows
 * cookie writes from Server Actions and Route Handlers — during an RSC render
 * this throws, which is expected and harmless: the middleware persists the
 * same pair on the following request, so this is a best-effort shortcut only.
 */
function persistRefreshedSession(
    cookieStore: Awaited<ReturnType<typeof cookies>>,
    sessionCookieName: string,
    refreshTokenCookieName: string,
    idToken: string,
    refreshToken: string,
): void {
    // No request URL here (unlike the middleware), so `secure` can't be
    // derived from the protocol — always secure, which is correct for every
    // origin a session cookie should be sent to anyway.
    const options = sessionCookieOptions(config.firebaseAuth!, true);
    try {
        cookieStore.set(sessionCookieName, idToken, options.session);
        cookieStore.set(refreshTokenCookieName, refreshToken, options.refresh);
    } catch {
        // Read-only cookie jar (RSC render) — middleware handles it next request.
    }
}

/**
 * Resolves the signed-in user on the server from the session cookie.
 * `initializeServerApp` validates the token with the Auth service, so a
 * missing, expired, or forged token yields `currentUser === null` — in which
 * case one refresh from the refresh-token cookie is attempted before giving
 * up. Wrapped in React's `cache()` so multiple server components in one
 * request share a single Auth service lookup. Lazily imports `firebase/app`/
 * `firebase/auth` — never touched unless this is actually called, and
 * throws if `firebaseAuth` is missing from `RoutingConfig`.
 */
export const getAuthenticatedAppForUser = cache(async function getAuthenticatedAppForUser(): Promise<{
    firebaseServerApp: FirebaseApp | null;
    currentUser: User | null;
}> {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const appCheckTokenCookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const cookieStore = await cookies();
    let authIdToken = cookieStore.get(sessionCookieName)?.value;

    // Safety net for the paths the middleware can't cover (prefetch requests,
    // excluded matcher routes, server actions): an expired token would be
    // rejected by `initializeServerApp` with `auth/invalid-user-token`, so
    // mint a fresh one from the refresh-token cookie first. The refreshed
    // token can't be written back to the cookie from here (RSC render), but
    // the middleware persists it on the next request.
    if (authIdToken && isIdTokenExpired(authIdToken)) {
        const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
        const result = refreshToken
            ? await refreshIdToken(fa.apiKey, refreshToken)
            : undefined;
        authIdToken = result?.status === 'refreshed' ? result.idToken : undefined;
    }

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
        ?? await mintServerAppCheckToken(fa.projectId, fa.apiKey, fa.appCheck);

    // A token that isn't merely expired-by-clock (revoked session, password
    // change, a token minted for a different project) is rejected with
    // `auth/invalid-user-token`. `initializeServerApp` does NOT surface that
    // as a rejection though — it logs "FirebaseServerApp could not login user
    // with provided authIdToken" itself and simply resolves `authStateReady()`
    // with `currentUser === null`. So a null user (not a throw) is the signal
    // to drop the bad token and mint a replacement from the refresh cookie.
    const attempt = async (idToken: string) => {
        firebaseAppModuleReady ??= import('firebase/app');
        firebaseAuthModuleReady ??= import('firebase/auth');
        const { initializeApp, initializeServerApp } = await firebaseAppModuleReady;
        const { getAuth } = await firebaseAuthModuleReady;

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
        // Cached as a promise (not the resolved app) so concurrent requests
        // racing this on a cold start share one `initializeApp` call instead
        // of each calling `initializeApp` with the same name and racing
        // Firebase's internal app registry.
        baseAppReady ??= (async () => initializeApp(firebaseConfig, 'firebase-auth-server-base'))();
        const baseApp = await baseAppReady;

        const firebaseServerApp = initializeServerApp(baseApp, { authIdToken: idToken, appCheckToken });
        const auth = getAuth(firebaseServerApp);
        await auth.authStateReady();

        return { firebaseServerApp, currentUser: auth.currentUser };
    };

    const retryWithFreshToken = async (rejectedToken: string) => {
        const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
        if (!refreshToken) return { firebaseServerApp: null, currentUser: null };
        // The cached entry is what produced `rejectedToken` in the first
        // place, so a plain refresh would hand back the same rejected token.
        const result = await refreshIdToken(fa.apiKey, refreshToken, { skipCache: true });
        if (result.status !== 'refreshed' || result.idToken === rejectedToken) {
            return { firebaseServerApp: null, currentUser: null };
        }
        try {
            const retried = await attempt(result.idToken);
            if (retried.currentUser) {
                persistRefreshedSession(cookieStore, sessionCookieName, refreshTokenCookieName, result.idToken, result.refreshToken);
            }
            return retried;
        } catch (retryError) {
            await reportError(config, { error: retryError, classOrMethodName: 'getAuthenticatedAppForUser' });
            return { firebaseServerApp: null, currentUser: null };
        }
    };

    try {
        const first = await attempt(authIdToken);
        // `initializeServerApp` reports an invalid/revoked token by resolving
        // with a null user rather than throwing — retry rather than render
        // this request as signed-out.
        if (!first.currentUser) return await retryWithFreshToken(authIdToken);
        return first;
    } catch (error) {
        if ((error as { code?: string })?.code === 'auth/invalid-user-token') {
            return await retryWithFreshToken(authIdToken);
        }
        await reportError(config, { error, classOrMethodName: 'getAuthenticatedAppForUser' });
        return { firebaseServerApp: null, currentUser: null };
    }
});
