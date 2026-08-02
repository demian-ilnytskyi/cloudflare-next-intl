'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { defaultSessionCookieName } from '../middleware/update_session';
import type { AuthUser, SerializedAuthUser } from '../types';

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
    document.cookie = `${sessionCookieName}=${idToken}; path=/; max-age=${maxAge}`;
}

function clearSessionCookie(sessionCookieName: string): void {
    document.cookie = `${sessionCookieName}=; path=/; max-age=0`;
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

    const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({
        user: initialUser,
        loading: initialUser === null,
    });
    const syncedSignedIn = useRef<boolean | undefined>(undefined);
    const consecutiveNulls = useRef(0);
    const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);

    useEffect(() => {
        const { user, loading } = state;
        if (loading || isAuthPage || isWhiteListed) return;

        if (!user) {
            if (confirmedSignedOut) router.replace(fa.redirectAuthPath);
        } else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            router.replace(fa.verifyEmailPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, pathname, isAuthPage, isWhiteListed, confirmedSignedOut]);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        getFirebaseAuthClient().then(async ({ auth }) => {
            if (cancelled) return;
            const { onIdTokenChanged } = await import('firebase/auth');

            unsubscribe = onIdTokenChanged(auth, async (user) => {
                const isSignedIn = !!user;
                const previous = syncedSignedIn.current;

                try {
                    if (user) {
                        writeSessionCookie(sessionCookieName, await user.getIdToken(true), maxAge);
                    } else if (previous) {
                        clearSessionCookie(sessionCookieName);
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
    }, [router, isAuthPage, maxAge, sessionCookieName]);

    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
        const { reload } = await import('firebase/auth');
        await reload(user);
        writeSessionCookie(sessionCookieName, await user.getIdToken(true), maxAge);
        setAuthUserCache(user);
        setState({ user, loading: false });
    }, [maxAge, sessionCookieName]);

    const sendVerificationEmail = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
        const { sendEmailVerification } = await import('firebase/auth');
        await sendEmailVerification(user);
    }, []);

    const logout = useCallback(async () => {
        try {
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
        } finally {
            clearSessionCookie(sessionCookieName);
            window.location.assign(fa.redirectAuthPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa.redirectAuthPath, sessionCookieName]);

    return <AuthUserContext.Provider value={{ ...state, reloadUser, sendVerificationEmail, logout }}>
        {children}
    </AuthUserContext.Provider>;
}
