'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { defaultEmailVerifiedHintCookieName, defaultRefreshTokenCookieName, defaultSessionCookieName } from '../middleware/update_session';
import decodeJwtPayload from '../decode_jwt_payload';
import setCookie from '../../client/functions/set_cookie';
import getCookie from '../../client/functions/get_cookie';
import clearSessionAction from '../server/clear_session_action';
import type { AuthUser, SerializedAuthUser } from '../types';
import type { User } from 'firebase/auth';

export interface AuthUserContextType {
    /** Current Firebase user, or `null` if signed out (or not yet resolved while `loading`). */
    user: AuthUser | null;
    /** `true` until the initial auth state has resolved on the client. */
    loading: boolean;
    /** Force-refreshes the current user's ID token/claims and re-syncs the session cookie. */
    reloadUser: () => Promise<void>;
    /** Sends a verification email to the currently signed-in user. */
    sendVerificationEmail: () => Promise<void>;
    /** Signs out, clears the session cookie, and redirects to `firebaseAuth.redirectAuthPath`. */
    logout: () => Promise<void>;
}

// `null` default (instead of a `{ loading: true, ... }` stand-in) lets
// `useAuthUser` distinguish "not wrapped in AuthUserProvider" (throw) from
// "wrapped, still loading" (`loading: true`).
export const AuthUserContext = createContext<AuthUserContextType | null>(null);
function writeSessionCookie(sessionCookieName: string, idToken: string, maxAge: number): void {
    setCookie({ name: sessionCookieName, value: idToken, maxAge });
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearSessionCookie(sessionCookieName: string): void {
    setCookie({ name: sessionCookieName, value: '', maxAge: 0 });
}

function writeRefreshTokenCookie(refreshTokenCookieName: string, user: User, maxAge: number): void {
    setCookie({ name: refreshTokenCookieName, value: user.refreshToken, maxAge });
}

function clearRefreshTokenCookie(refreshTokenCookieName: string): void {
    setCookie({ name: refreshTokenCookieName, value: '', maxAge: 0 });
}

// Mirrors the live SDK's `emailVerified` into a client-readable cookie so
// the middleware can tell "the client already agrees with the session JWT's
// claim" (skip the extra refresh) apart from "the client observed a change
// this claim hasn't caught up to yet" (worth one refresh to confirm).
function writeEmailVerifiedHintCookie(emailVerifiedHintCookieName: string, emailVerified: boolean, maxAge: number): void {
    setCookie({ name: emailVerifiedHintCookieName, value: String(emailVerified), maxAge });
}

async function clearSession(sessionCookieName: string, refreshTokenCookieName: string, emailVerifiedHintCookieName: string, refreshTokenMaxAge: number): Promise<void> {
    clearSessionCookie(sessionCookieName);
    clearRefreshTokenCookie(refreshTokenCookieName);
    // Signed-out is not "unknown" — it's a confirmed non-verified state, so
    // write 'false' explicitly rather than clearing (an absent hint means
    // "no signal yet", which forces the middleware to refresh unnecessarily
    // if a stale session cookie somehow still lingers).
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, false, refreshTokenMaxAge);
    try {
        await clearSessionAction();
    } catch (e) {
        console.error('AuthUserProvider: clearSessionAction failed', e);
    }
}

async function writeSession(
    user: User,
    sessionCookieName: string,
    maxAge: number,
    refreshTokenCookieName: string,
    refreshTokenMaxAge: number,
    emailVerifiedHintCookieName: string,
    idToken?: string,
): Promise<void> {
    try {
        writeRefreshTokenCookie(refreshTokenCookieName, user, refreshTokenMaxAge);
    } catch (e) {
        console.error('AuthUserProvider: refresh-token cookie sync failed', e);
    }
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, user.emailVerified, refreshTokenMaxAge);
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
export default function AuthUserProvider({ initialUser = null, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}) {
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
    const emailVerifiedHintCookieName = fa.emailVerifiedHintCookieName ?? defaultEmailVerifiedHintCookieName;
    const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({
        user: initialUser,
        loading: initialUser === null,
    });
    // The signed-in state the last successful cookie write left behind, so a
    // plain token refresh (same state) does not trigger a needless re-render.
    const syncedSignedIn = useRef<boolean | undefined>(undefined);
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
        if (loading || isWhiteListed) return;

        if (!user) {
            // Signed-out on an auth page is where they're supposed to be —
            // only bounce a signed-out user away from a NON-auth page.
            if (!isAuthPage && confirmedSignedOut) router.replace(fa.redirectAuthPath);
        } else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            // Checked before the auth-page redirect below (mirrors
            // `update_session.ts`'s same ordering): an unverified signed-in
            // user must land on verifyEmailPath even if they navigated to
            // an auth page like /login — homePath isn't reachable yet either.
            router.replace(fa.verifyEmailPath);
        } else if (isAuthPage || (fa.verifyEmailPath && user.emailVerified && pathname === fa.verifyEmailPath)) {
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
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        getFirebaseAuthClient().then(async ({ auth }) => {
            if (cancelled) return;
            const { onIdTokenChanged } = await getFirebaseAuthModule();

            unsubscribe = onIdTokenChanged(auth, async (user) => {
                const isSignedIn = !!user;
                const previous = syncedSignedIn.current;

                try {
                    if (user) {
                        await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName);
                    } else {
                        await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, refreshTokenMaxAge);
                    }
                } catch (e) {
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
                } else {
                    consecutiveNulls.current += 1;
                    if (consecutiveNulls.current >= 2) setConfirmedSignedOut(true);
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
    }, [router, isAuthPage, maxAge, sessionCookieName, refreshTokenMaxAge, refreshTokenCookieName, emailVerifiedHintCookieName]);

    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
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
            let confirmedToken: string | undefined;
            if (previousIat !== undefined) {
                const maxAttempts = 3;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    const freshToken = await user.getIdToken(true);
                    confirmedToken = freshToken;
                    const freshIat = decodeJwtPayload(freshToken)?.iat;
                    if (freshIat !== undefined && freshIat > previousIat) break;
                    if (attempt < maxAttempts - 1) await sleep(500);
                }
            }

            await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, confirmedToken);
            setAuthUserCache(user);
            setState({ user, loading: false });
        } catch (e) {
            console.error('AuthUserProvider: reloadUser failed', e);
        }
    }, []);

    const sendVerificationEmail = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
        const { sendEmailVerification } = await getFirebaseAuthModule();
        await sendEmailVerification(user);
    }, []);

    const logout = useCallback(async () => {
        try {
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await getFirebaseAuthModule();
            await signOut(auth);
        } finally {
            await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, refreshTokenMaxAge);
            router.push(fa.redirectAuthPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa.redirectAuthPath, sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName]);

    return <AuthUserContext.Provider value={{ ...state, reloadUser, sendVerificationEmail, logout }}>
        {children}
    </AuthUserContext.Provider>;
}
