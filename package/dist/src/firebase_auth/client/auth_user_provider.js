'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { defaultRefreshTokenCookieName, defaultSessionCookieName } from '../middleware/update_session';
import setCookie from '../../client/functions/set_cookie';
// `null` default (instead of a `{ loading: true, ... }` stand-in) lets
// `useAuthUser` distinguish "not wrapped in AuthUserProvider" (throw) from
// "wrapped, still loading" (`loading: true`).
export const AuthUserContext = createContext(null);
function writeSessionCookie(sessionCookieName, idToken, maxAge) {
    setCookie({ name: sessionCookieName, value: idToken, maxAge });
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
/**
 * Client-side auth-state provider for `firebase_auth`. Wrap your root layout
 * (or a client boundary below it) with this to make `useAuthUser()`
 * (`cloudflare-next-intl/useFirebaseAuthUser`, client variant) resolve
 * `{ user, loading }` from the live Firebase `onIdTokenChanged` listener,
 * and to get automatic session-cookie sync + redirect-on-sign-out/verify
 * behavior driven by `firebaseAuth.isAuthPath` / `whiteListPaths` /
 * `redirectAuthPath` / `verifyEmailPath` on your `RoutingConfig`.
 *
 * Requires `firebaseAuth` to be set on the config passed to `setIntlConfig`
 * — throws via {@link requireFirebaseAuthConfig} otherwise.
 *
 * @param initialUser Server-resolved user (e.g. from
 *   `useFirebaseAuthUser`'s `react-server` variant) to avoid a
 *   loading flash on first paint; pass `null`/omit if unavailable.
 * @example
 * <AuthUserProvider initialUser={initialUser}>{children}</AuthUserProvider>
 */
export default function AuthUserProvider({ initialUser = null, children }) {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = fa.isAuthPath(pathname);
    const isWhiteListed = fa.whiteListPaths?.includes(pathname) ?? false;
    const maxAge = fa.sessionCookieMaxAge ?? 60 * 60 * 24 * 5;
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenMaxAge = fa.refreshTokenCookieMaxAge ?? 60 * 60 * 24 * 365;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const [state, setState] = useState({
        user: initialUser,
        loading: initialUser === null,
    });
    // The signed-in state the last successful cookie write left behind, so a
    // plain token refresh (same state) does not trigger a needless re-render.
    const syncedSignedIn = useRef(undefined);
    // Consecutive `onIdTokenChanged(null)` callbacks since the last confirmed
    // user. A single null here can be a transient client-SDK hiccup (e.g. its
    // token-refresh scheduling misbehaving under local clock skew) rather
    // than a real sign-out — the server already proved the session valid via
    // `initialUser`, so redirecting on the very first null caused a
    // login-then-bounce-home flash whenever the two disagreed.
    const consecutiveNulls = useRef(0);
    const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);
    useEffect(() => {
        const { user, loading } = state;
        if (loading || isAuthPage || isWhiteListed)
            return;
        if (!user) {
            if (confirmedSignedOut)
                router.replace(fa.redirectAuthPath);
        }
        else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            router.replace(fa.verifyEmailPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, pathname, isAuthPage, isWhiteListed, confirmedSignedOut]);
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
                        try {
                            writeRefreshTokenCookie(refreshTokenCookieName, user, refreshTokenMaxAge);
                        }
                        catch (e) {
                            console.error('AuthUserProvider: refresh-token cookie sync failed', e);
                        }
                        const token = await user.getIdToken(true);
                        writeSessionCookie(sessionCookieName, token, maxAge);
                    }
                    else if (previous) {
                        clearSessionCookie(sessionCookieName);
                        clearRefreshTokenCookie(refreshTokenCookieName);
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
                }
                else {
                    consecutiveNulls.current += 1;
                    if (consecutiveNulls.current >= 2)
                        setConfirmedSignedOut(true);
                }
                const flipped = previous !== undefined && previous !== isSignedIn;
                const contradictsPage = previous === undefined && isSignedIn === isAuthPage;
                if (flipped || contradictsPage) {
                    router.refresh();
                }
            });
        });
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, isAuthPage, maxAge, sessionCookieName, refreshTokenMaxAge, refreshTokenCookieName]);
    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        try {
            const { reload } = await getFirebaseAuthModule();
            await reload(user);
            try {
                writeRefreshTokenCookie(refreshTokenCookieName, user, refreshTokenMaxAge);
            }
            catch (e) {
                console.error('AuthUserProvider: refresh-token cookie sync failed', e);
            }
            writeSessionCookie(sessionCookieName, await user.getIdToken(true), maxAge);
            setAuthUserCache(user);
            setState({ user, loading: false });
        }
        catch (e) {
            console.error('AuthUserProvider: reloadUser failed', e);
        }
    }, []);
    const sendVerificationEmail = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        const { sendEmailVerification } = await getFirebaseAuthModule();
        await sendEmailVerification(user);
    }, []);
    const logout = useCallback(async () => {
        try {
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await getFirebaseAuthModule();
            await signOut(auth);
        }
        finally {
            clearSessionCookie(sessionCookieName);
            clearRefreshTokenCookie(refreshTokenCookieName);
            window.location.assign(fa.redirectAuthPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa.redirectAuthPath, sessionCookieName, refreshTokenCookieName]);
    return _jsx(AuthUserContext.Provider, { value: { ...state, reloadUser, sendVerificationEmail, logout }, children: children });
}
