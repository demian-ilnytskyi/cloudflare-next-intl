'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name.js';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { getAppCheckToken, getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client.js';
import { setAuthUserCache } from './auth_user_cache.js';
import { defaultAppCheckTokenCookieName, defaultEmailVerifiedHintCookieName, defaultRefreshTokenCookieName, defaultSessionCookieName } from '../middleware/update_session.js';
import decodeJwtPayload from '../decode_jwt_payload.js';
import isWhitelisted from '../is_whitelisted.js';
import withRedirectQuery from '../preserve_redirect_query.js';
import setCookie from '../../client/functions/set_cookie.js';
import getCookie from '../../client/functions/get_cookie.js';
import clearSessionAction from '../server/clear_session_action.js';
export const AuthUserContext = createContext(null);
function writeSessionCookie(sessionCookieName, idToken, maxAge) {
    setCookie({ name: sessionCookieName, value: idToken, maxAge });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function clearSessionCookie(sessionCookieName) {
    setCookie({ name: sessionCookieName, value: '', maxAge: 0 });
}
function writeRefreshTokenCookie(refreshTokenCookieName, user, maxAge) {
    setCookie({ name: refreshTokenCookieName, value: user.refreshToken, maxAge });
}
function clearRefreshTokenCookie(refreshTokenCookieName) {
    setCookie({ name: refreshTokenCookieName, value: '', maxAge: 0 });
}
function writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, emailVerified, maxAge) {
    setCookie({ name: emailVerifiedHintCookieName, value: String(emailVerified), maxAge });
}
function clearAppCheckTokenCookie(appCheckTokenCookieName) {
    setCookie({ name: appCheckTokenCookieName, value: '', maxAge: 0 });
}
async function writeAppCheckTokenCookie(appCheckTokenCookieName, maxAge) {
    try {
        const token = await getAppCheckToken();
        if (token)
            setCookie({ name: appCheckTokenCookieName, value: token, maxAge });
    }
    catch (e) {
        console.error('AuthUserProvider: App Check token cookie sync failed', e);
    }
}
async function clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge) {
    clearSessionCookie(sessionCookieName);
    clearRefreshTokenCookie(refreshTokenCookieName);
    clearAppCheckTokenCookie(appCheckTokenCookieName);
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, false, refreshTokenMaxAge);
    try {
        await clearSessionAction();
    }
    catch (e) {
        console.error('AuthUserProvider: clearSessionAction failed', e);
    }
}
async function writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge, idToken) {
    try {
        writeRefreshTokenCookie(refreshTokenCookieName, user, refreshTokenMaxAge);
    }
    catch (e) {
        console.error('AuthUserProvider: refresh-token cookie sync failed', e);
    }
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, user.emailVerified, refreshTokenMaxAge);
    await writeAppCheckTokenCookie(appCheckTokenCookieName, appCheckTokenMaxAge);
    writeSessionCookie(sessionCookieName, idToken ?? await user.getIdToken(true), maxAge);
}
export default function AuthUserProvider({ initialUser = null, children }) {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = fa.isAuthPath(pathname);
    const isWhiteListed = isWhitelisted(pathname, fa.whiteListPaths);
    const maxAge = fa.sessionCookieMaxAge ?? 60 * 60 * 24 * 5;
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenMaxAge = fa.refreshTokenCookieMaxAge ?? 60 * 60 * 24 * 365;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const emailVerifiedHintCookieName = fa.emailVerifiedHintCookieName ?? defaultEmailVerifiedHintCookieName;
    const appCheckTokenCookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const appCheckTokenMaxAge = fa.appCheckTokenCookieMaxAge ?? 60 * 60;
    const [state, setState] = useState({
        user: initialUser,
        loading: initialUser === null,
    });
    const syncedSignedIn = useRef(undefined);
    const consecutiveNulls = useRef(0);
    const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);
    const signInCallbackFired = useRef(initialUser !== null);
    const signOutCallbackFired = useRef(initialUser === null);
    const emailVerifiedRef = useRef(initialUser?.emailVerified ?? false);
    useEffect(() => {
        const { user, loading } = state;
        if (loading || isWhiteListed)
            return;
        if (!user) {
            if (!isAuthPage && confirmedSignedOut)
                router.replace(withRedirectQuery(fa.redirectAuthPath, window.location.search));
        }
        else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            router.replace(withRedirectQuery(fa.verifyEmailPath, window.location.search));
        }
        else if (isAuthPage || (fa.verifyEmailPath && user.emailVerified && pathname === fa.verifyEmailPath)) {
            router.replace(withRedirectQuery(fa.homePath, window.location.search));
        }
    }, [state, pathname, isAuthPage, isWhiteListed, confirmedSignedOut, fa, router]);
    useEffect(() => {
        let unsubscribe;
        let cancelled = false;
        getFirebaseAuthClient().then(async ({ auth }) => {
            if (cancelled)
                return;
            const { onIdTokenChanged } = await getFirebaseAuthModule();
            unsubscribe = onIdTokenChanged(auth, async (user) => {
                const isSignedIn = !!user;
                const previous = syncedSignedIn.current;
                try {
                    if (user) {
                        await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge);
                    }
                    else {
                        await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge);
                    }
                }
                catch (e) {
                    console.error('AuthUserProvider: session sync failed', e);
                    setAuthUserCache(user);
                    setState({ user, loading: false });
                    return;
                }
                syncedSignedIn.current = isSignedIn;
                setAuthUserCache(user);
                setState({ user, loading: false });
                if (user) {
                    consecutiveNulls.current = 0;
                    setConfirmedSignedOut(false);
                    signOutCallbackFired.current = false;
                    if (!signInCallbackFired.current) {
                        signInCallbackFired.current = true;
                        try {
                            await fa.onSignIn?.(user);
                        }
                        catch (e) {
                            console.error('AuthUserProvider: onSignIn callback failed', e);
                        }
                    }
                    if (!emailVerifiedRef.current && user.emailVerified) {
                        emailVerifiedRef.current = true;
                        try {
                            await fa.onEmailVerified?.(user);
                        }
                        catch (e) {
                            console.error('AuthUserProvider: onEmailVerified callback failed', e);
                        }
                    }
                    else {
                        emailVerifiedRef.current = user.emailVerified;
                    }
                }
                else {
                    consecutiveNulls.current += 1;
                    signInCallbackFired.current = false;
                    if (consecutiveNulls.current >= 2 && !signOutCallbackFired.current) {
                        setConfirmedSignedOut(true);
                        signOutCallbackFired.current = true;
                        try {
                            await fa.onSignOut?.();
                        }
                        catch (e) {
                            console.error('AuthUserProvider: onSignOut callback failed', e);
                        }
                    }
                }
                const flipped = previous !== undefined && previous !== isSignedIn;
                const contradictsPage = !isWhiteListed && previous === undefined && isSignedIn === isAuthPage;
                if (flipped || contradictsPage) {
                    router.refresh();
                }
            });
        });
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [router, isAuthPage, isWhiteListed, maxAge, sessionCookieName, refreshTokenMaxAge, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge, fa]);
    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        try {
            const { reload } = await getFirebaseAuthModule();
            await reload(user);
            const previousIat = decodeJwtPayload(getCookie(sessionCookieName) ?? '')?.iat;
            let confirmedToken;
            if (previousIat !== undefined) {
                const maxAttempts = 3;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    const freshToken = await user.getIdToken(true);
                    confirmedToken = freshToken;
                    const freshIat = decodeJwtPayload(freshToken)?.iat;
                    if (freshIat !== undefined && freshIat > previousIat)
                        break;
                    if (attempt < maxAttempts - 1)
                        await sleep(500);
                }
            }
            await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge, confirmedToken);
            if (!emailVerifiedRef.current && user.emailVerified) {
                emailVerifiedRef.current = true;
                try {
                    await fa.onEmailVerified?.(user);
                }
                catch (e) {
                    console.error('AuthUserProvider: onEmailVerified callback failed', e);
                }
            }
            else {
                emailVerifiedRef.current = user.emailVerified;
            }
            setAuthUserCache(user);
            setState({ user, loading: false });
        }
        catch (e) {
            console.error('AuthUserProvider: reloadUser failed', e);
        }
    }, [fa, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge]);
    const sendVerificationEmail = useCallback(async (actionCodeSettings) => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        const { sendEmailVerification } = await getFirebaseAuthModule();
        await sendEmailVerification(user, actionCodeSettings);
    }, []);
    const logout = useCallback(async () => {
        try {
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await getFirebaseAuthModule();
            await signOut(auth);
        }
        finally {
            await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge);
            if (!isWhiteListed)
                router.push(fa.redirectAuthPath);
        }
    }, [fa, router, sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, isWhiteListed]);
    return _jsx(AuthUserContext.Provider, { value: { ...state, reloadUser, sendVerificationEmail, logout }, children: children });
}
