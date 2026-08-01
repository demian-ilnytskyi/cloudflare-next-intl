'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { sessionCookieName } from '../middleware/update_session';
const noop = async () => { };
export const AuthUserContext = createContext({
    user: null,
    loading: true,
    reloadUser: noop,
    sendVerificationEmail: noop,
    logout: noop,
});
function writeSessionCookie(idToken, maxAge) {
    document.cookie = `${sessionCookieName}=${idToken}; path=/; max-age=${maxAge}`;
}
function clearSessionCookie() {
    document.cookie = `${sessionCookieName}=; path=/; max-age=0`;
}
export default function AuthUserProvider({ initialUser = null, children }) {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = fa.isAuthPath(pathname);
    const isWhiteListed = fa.whiteListPaths?.includes(pathname) ?? false;
    const maxAge = fa.sessionCookieMaxAge ?? 60 * 60 * 24 * 5;
    const [state, setState] = useState({
        user: initialUser,
        loading: initialUser === null,
    });
    const syncedSignedIn = useRef(undefined);
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
            const { onIdTokenChanged } = await import('firebase/auth');
            unsubscribe = onIdTokenChanged(auth, async (user) => {
                const isSignedIn = !!user;
                const previous = syncedSignedIn.current;
                try {
                    if (user) {
                        writeSessionCookie(await user.getIdToken(true), maxAge);
                    }
                    else if (previous) {
                        clearSessionCookie();
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
    }, [router, isAuthPage, maxAge]);
    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        const { reload } = await import('firebase/auth');
        await reload(user);
        writeSessionCookie(await user.getIdToken(true), maxAge);
        setAuthUserCache(user);
        setState({ user, loading: false });
    }, [maxAge]);
    const sendVerificationEmail = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user)
            return;
        const { sendEmailVerification } = await import('firebase/auth');
        await sendEmailVerification(user);
    }, []);
    const logout = useCallback(async () => {
        try {
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
        }
        finally {
            clearSessionCookie();
            window.location.assign(fa.redirectAuthPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa.redirectAuthPath]);
    return _jsx(AuthUserContext.Provider, { value: { ...state, reloadUser, sendVerificationEmail, logout }, children: children });
}
