import { cookies } from 'next/headers';
import { cache } from 'react';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { defaultAppCheckTokenCookieName, defaultRefreshTokenCookieName, defaultSessionCookieName, isIdTokenExpired, refreshIdToken, sessionCookieOptions } from '../middleware/update_session.js';
import reportError from '../../error_handling/report_error.js';
import mintServerAppCheckToken from './mint_server_app_check_token.js';
let baseAppReady;
let firebaseAppModuleReady;
let firebaseAuthModuleReady;
function persistRefreshedSession(cookieStore, sessionCookieName, refreshTokenCookieName, idToken, refreshToken) {
    const options = sessionCookieOptions(config.firebaseAuth, true);
    try {
        cookieStore.set(sessionCookieName, idToken, options.session);
        cookieStore.set(refreshTokenCookieName, refreshToken, options.refresh);
    }
    catch {
    }
}
export const getAuthenticatedAppForUser = cache(async function getAuthenticatedAppForUser() {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const appCheckTokenCookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const cookieStore = await cookies();
    let authIdToken = cookieStore.get(sessionCookieName)?.value;
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
    const appCheckToken = cookieStore.get(appCheckTokenCookieName)?.value
        ?? await mintServerAppCheckToken(fa.projectId, fa.apiKey, fa.appCheck);
    const attempt = async (idToken) => {
        firebaseAppModuleReady ?? (firebaseAppModuleReady = import('@firebase/app'));
        firebaseAuthModuleReady ?? (firebaseAuthModuleReady = import('@firebase/auth'));
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
        baseAppReady ?? (baseAppReady = (async () => initializeApp(firebaseConfig, 'firebase-auth-server-base'))());
        const baseApp = await baseAppReady;
        const firebaseServerApp = initializeServerApp(baseApp, { authIdToken: idToken, appCheckToken });
        const auth = getAuth(firebaseServerApp);
        await auth.authStateReady();
        return { firebaseServerApp, currentUser: auth.currentUser };
    };
    const retryWithFreshToken = async (rejectedToken) => {
        const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
        if (!refreshToken)
            return { firebaseServerApp: null, currentUser: null };
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
        }
        catch (retryError) {
            await reportError(config, { error: retryError, classOrMethodName: 'getAuthenticatedAppForUser' });
            return { firebaseServerApp: null, currentUser: null };
        }
    };
    try {
        const first = await attempt(authIdToken);
        if (!first.currentUser)
            return await retryWithFreshToken(authIdToken);
        return first;
    }
    catch (error) {
        if (error?.code === 'auth/invalid-user-token') {
            return await retryWithFreshToken(authIdToken);
        }
        await reportError(config, { error, classOrMethodName: 'getAuthenticatedAppForUser' });
        return { firebaseServerApp: null, currentUser: null };
    }
});
