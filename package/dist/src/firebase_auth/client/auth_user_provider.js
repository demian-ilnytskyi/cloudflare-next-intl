'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getAppCheckToken, getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { defaultAppCheckTokenCookieName, defaultEmailVerifiedHintCookieName, defaultRefreshTokenCookieName, defaultSessionCookieName } from '../middleware/update_session';
import decodeJwtPayload from '../decode_jwt_payload';
import isWhitelisted from '../is_whitelisted';
import setCookie from '../../client/functions/set_cookie';
import getCookie from '../../client/functions/get_cookie';
import clearSessionAction from '../server/clear_session_action';
// `null` default (instead of a `{ loading: true, ... }` stand-in) lets
// `useAuthUser` distinguish "not wrapped in AuthUserProvider" (throw) from
// "wrapped, still loading" (`loading: true`).
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
// Mirrors the live SDK's `emailVerified` into a client-readable cookie so
// the middleware can tell "the client already agrees with the session JWT's
// claim" (skip the extra refresh) apart from "the client observed a change
// this claim hasn't caught up to yet" (worth one refresh to confirm).
function writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, emailVerified, maxAge) {
    setCookie({ name: emailVerifiedHintCookieName, value: String(emailVerified), maxAge });
}
function clearAppCheckTokenCookie(appCheckTokenCookieName) {
    setCookie({ name: appCheckTokenCookieName, value: '', maxAge: 0 });
}
// Mirrors the live App Check token into a client-readable cookie so
// `getAuthenticatedAppForUser` can forward it to `initializeServerApp` —
// required whenever App Check enforcement is on for Auth, or every
// server-side `getAuthUser()` call is rejected with
// `auth/firebase-app-check-token-is-invalid`. Best-effort: App Check may not
// be configured, or a token fetch can transiently fail (e.g. reCAPTCHA not
// yet ready) — either case just leaves the cookie unset rather than blocking
// session sync on it.
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
    // Signed-out is not "unknown" — it's a confirmed non-verified state, so
    // write 'false' explicitly rather than clearing (an absent hint means
    // "no signal yet", which forces the middleware to refresh unnecessarily
    // if a stale session cookie somehow still lingers).
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
    // Whether `onSignIn`/`onSignOut` have already fired for the CURRENT
    // signed-in/signed-out state — both seeded from `initialUser` so a
    // callback observing the SAME state `initialUser` already established
    // (server-resolved, not a fresh client-side transition) does not refire
    // it. Reset on the opposite transition so the next real occurrence of
    // this state fires again.
    const signInCallbackFired = useRef(initialUser !== null);
    const signOutCallbackFired = useRef(initialUser === null);
    // Tracks the last-observed `emailVerified` value so `onEmailVerified`
    // fires exactly once on the false→true edge, not on every later
    // observation of an already-verified user (both `onIdTokenChanged` and
    // `reloadUser` can be the first to observe the transition).
    const emailVerifiedRef = useRef(initialUser?.emailVerified ?? false);
    useEffect(() => {
        const { user, loading } = state;
        if (loading || isWhiteListed)
            return;
        if (!user) {
            // Signed-out on an auth page is where they're supposed to be —
            // only bounce a signed-out user away from a NON-auth page.
            if (!isAuthPage && confirmedSignedOut)
                router.replace(fa.redirectAuthPath);
        }
        else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            // Checked before the auth-page redirect below (mirrors
            // `update_session.ts`'s same ordering): an unverified signed-in
            // user must land on verifyEmailPath even if they navigated to
            // an auth page like /login — homePath isn't reachable yet either.
            router.replace(fa.verifyEmailPath);
        }
        else if (isAuthPage || (fa.verifyEmailPath && user.emailVerified && pathname === fa.verifyEmailPath)) {
            // Mirrors the middleware's own signed-in-on-auth-page redirect
            // (`update_session.ts`'s `isAuthPage` branch) — needed here too
            // because a client-side navigation (e.g. a `<Link>`) to an auth
            // page never re-runs the middleware, so without this the user
            // would land on e.g. `/login` while already signed in and stay
            // there until a hard refresh. A verified user reaching
            // verifyEmailPath itself gets the same "go home" treatment —
            // they're done here, same as the auth-page case.
            router.replace(fa.homePath);
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
    }, [router, isAuthPage, maxAge, sessionCookieName, refreshTokenMaxAge, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge]);
    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        try {
            const { reload } = await getFirebaseAuthModule();
            await reload(user);
            // `getIdToken(true)` can occasionally hand back a token that's
            // no newer than the one already in the session cookie — a stale
            // token caught mid-propagation right after `reload()`, rather
            // than the fresh mint the caller asked for. Comparing `iat`
            // (issued-at) against the existing cookie's token is a direct
            // check that the token we're about to write is actually new;
            // retry a few times if it isn't before giving up and writing
            // whatever we got. The confirmed token is threaded into
            // `writeSession` directly — letting it call `getIdToken(true)`
            // again on its own could re-fetch and land back on a stale
            // token, undoing this retry entirely.
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
            await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge);
            router.push(fa.redirectAuthPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa.redirectAuthPath, sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName]);
    return _jsx(AuthUserContext.Provider, { value: { ...state, reloadUser, sendVerificationEmail, logout }, children: children });
}
