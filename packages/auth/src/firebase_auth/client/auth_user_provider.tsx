'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation.js';
import usePathname from 'cloudflare-next-intl-intl/usePathname';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { getAppCheckToken, getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client.js';
import { ensureSessionSynced } from './session_sync.js';
import { setAuthUserCache } from './auth_user_cache.js';
import {
    defaultAppCheckTokenCookieName,
    defaultEmailVerifiedHintCookieName,
    defaultRefreshTokenCookieName,
    defaultSessionCookieName,
    defaultSessionMarkerCookieName,
    defaultDeviceProofCookieName,
    defaultProofRequiredCookieName,
} from '../cookie_names.js';
import { decodeSessionMarker } from '../session_marker.js';
import decodeJwtPayload from '../decode_jwt_payload.js';
import isWhitelisted from '../is_whitelisted.js';
import withRedirectQuery from '../preserve_redirect_query.js';
import setCookie from 'cloudflare-next-intl-intl/setCookie';
import getCookie from 'cloudflare-next-intl-intl/getCookie';
import clearSessionAction from '../server/clear_session_action.js';
import restoreSessionAction from '../server/restore_session_action.js';
import syncSessionAction from '../server/sync_session_action.js';
import { getDeviceKey, resetDeviceKey } from './device_key.js';
import { createDeviceProof, DEFAULT_PROOF_MAX_AGE_SECONDS } from '../device_proof.js';
import type { AuthActionCodeSettings, AuthUser, SerializedAuthUser } from '../types.js';
import type { User } from '@firebase/auth';
import { AuthUserContext, type AuthUserContextType } from './auth_user_context.js';

async function writeProofCookie(
    proofCookieName: string,
    proofMaxAgeSeconds: number,
    refreshTokenOrHash?: string,
): Promise<boolean> {
    const key = await getDeviceKey(false);
    if (!key) return false;
    let tokenOrHash = refreshTokenOrHash;
    if (!tokenOrHash) {
        const markerVal = getCookie(defaultSessionMarkerCookieName);
        const decoded = decodeSessionMarker(markerVal);
        tokenOrHash = decoded?.hash;
    }
    if (!tokenOrHash) return false;
    try {
        const now = Math.floor(Date.now() / 1000);
        const proof = await createDeviceProof(key, tokenOrHash, now);
        setCookie({ name: proofCookieName, value: proof, maxAge: proofMaxAgeSeconds });
        return true;
    } catch (e) {
        console.error('AuthUserProvider: writeProofCookie failed', e);
        return false;
    }
}

const AUTH_SUBSCRIBE_IDLE_TIMEOUT_MS = 3_000;
const AUTH_SUBSCRIBE_FALLBACK_DELAY_MS = 1_500;

export { AuthUserContext };
export type { AuthUserContextType };

export function hasServerSessionMarker(): boolean {
    const fa = config.firebaseAuth;
    const cookieName = fa?.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    return decodeSessionMarker(getCookie(cookieName)) !== null;
}

export function shouldClearServerCookies(previous: boolean | undefined, initialSignedIn: boolean, isAuthPage: boolean): boolean {
    return Boolean(previous ?? (initialSignedIn || isAuthPage));
}

// Mirrors the live SDK's `emailVerified` into a client-readable cookie so
// the middleware can tell "the client already agrees with the session JWT's
// claim" (skip the extra refresh) apart from "the client observed a change
// this claim hasn't caught up to yet" (worth one refresh to confirm).
function writeEmailVerifiedHintCookie(emailVerifiedHintCookieName: string, emailVerified: boolean, maxAge: number): void {
    setCookie({ name: emailVerifiedHintCookieName, value: String(emailVerified), maxAge });
}

function clearAppCheckTokenCookie(appCheckTokenCookieName: string): void {
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
async function writeAppCheckTokenCookie(appCheckTokenCookieName: string, maxAge: number): Promise<void> {
    try {
        const token = await getAppCheckToken();
        if (token) {
            const decoded = decodeJwtPayload(token);
            const now = Math.floor(Date.now() / 1000);
            const calculatedMaxAge = decoded?.exp ? Math.max(0, decoded.exp - now - 60) : maxAge;
            setCookie({ name: appCheckTokenCookieName, value: token, maxAge: calculatedMaxAge });
        }
    } catch (e) {
        console.error('AuthUserProvider: App Check token cookie sync failed', e);
    }
}

async function clearSession(
    emailVerifiedHintCookieName: string,
    appCheckTokenCookieName: string,
    refreshTokenMaxAge: number,
    clearServerCookies = true,
): Promise<void> {
    clearAppCheckTokenCookie(appCheckTokenCookieName);
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, false, refreshTokenMaxAge);
    if (!clearServerCookies) return;
    setCookie({ name: defaultSessionMarkerCookieName, value: '', maxAge: 0 });
    setCookie({ name: defaultDeviceProofCookieName, value: '', maxAge: 0 });
    setCookie({ name: defaultProofRequiredCookieName, value: '', maxAge: 0 });
    try {
        await clearSessionAction();
    } catch (e) {
        console.error('AuthUserProvider: clearSessionAction failed', e);
    }
}

async function writeSession(
    user: User,
    emailVerifiedHintCookieName: string,
    appCheckTokenCookieName: string,
    refreshTokenMaxAge: number,
    appCheckTokenMaxAge: number,
): Promise<void> {
    writeEmailVerifiedHintCookie(emailVerifiedHintCookieName, user.emailVerified, refreshTokenMaxAge);
    await Promise.all([
        writeAppCheckTokenCookie(appCheckTokenCookieName, appCheckTokenMaxAge),
        ensureSessionSynced(user),
    ]);
}

/**
 * Client-side auth-state provider for `firebase_auth`. Wrap your root layout
 * (or a client boundary below it) with this to make `useAuthUser()`
 * (`cloudflare-next-intl/useFirebaseAuthUser`, client variant) resolve
 * `{ user, loading }` from the live Firebase `onIdTokenChanged` listener,
 * and to get automatic session-cookie sync + redirect-on-sign-out/verify
 * behavior driven by `firebaseAuth.isAuthPath` / `whiteListPaths` /
 * `redirectAuthPath` / `verifyEmailPath` on your `RoutingConfig`.
 */
export default function AuthUserProvider({
    children,
    initialUser,
}: {
    children: React.ReactNode;
    initialUser: SerializedAuthUser | null;
}): React.JSX.Element {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);

    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = fa.isAuthPath(pathname);
    const isWhiteListed = fa.protectedPaths
        ? !fa.protectedPaths(pathname) && !isAuthPage
        : isWhitelisted(pathname, fa.whiteListPaths);
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenMaxAge = fa.refreshTokenCookieMaxAge ?? 60 * 60 * 24 * 365;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const emailVerifiedHintCookieName = fa.emailVerifiedHintCookieName ?? defaultEmailVerifiedHintCookieName;
    const sessionMarkerCookieName = fa.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    const appCheckTokenCookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const appCheckTokenMaxAge = fa.appCheckTokenCookieMaxAge ?? 60 * 60;
    const bindingEnabled = Boolean(fa.deviceBinding);
    const proofCookieName = fa.deviceProofCookieName ?? defaultDeviceProofCookieName;
    const proofMaxAgeSeconds = fa.deviceBinding?.proofMaxAgeSeconds ?? DEFAULT_PROOF_MAX_AGE_SECONDS;
    const proofRequiredCookieName = defaultProofRequiredCookieName;
    const proofRefreshAttempted = useRef(false);
    const isLoggingOutRef = useRef(false);
    const routerRef = useRef(router);
    routerRef.current = router;

    const hasProofRequiredOnMount = bindingEnabled && typeof document !== 'undefined' && getCookie(proofRequiredCookieName) === '1';

    const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({
        user: initialUser,
        loading: initialUser === null || hasProofRequiredOnMount,
    });
    const syncedSignedIn = useRef<boolean | undefined>(undefined);
    const consecutiveNulls = useRef(0);
    const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);
    const signInCallbackFired = useRef(initialUser !== null);
    const signOutCallbackFired = useRef(initialUser === null);
    const emailVerifiedRef = useRef(initialUser?.emailVerified ?? false);
    const isAuthPageRef = useRef(isAuthPage);
    isAuthPageRef.current = isAuthPage;
    const initialSignedIn = Boolean(initialUser);
    const deferAuthSubscribe = initialUser === null && isWhiteListed && !isAuthPage && !hasServerSessionMarker() && typeof window !== 'undefined';
    const restoreAttemptedRef = useRef(false);

    const userRefreshToken = (() => {
        try {
            return (state.user as { refreshToken?: string } | null)?.refreshToken;
        } catch {
            return undefined;
        }
    })();

    useEffect(() => {
        if (!bindingEnabled || !userRefreshToken) return;
        const intervalMs = Math.max(1, Math.floor(proofMaxAgeSeconds / 2)) * 1000;
        const handle = setInterval(() => {
            void writeProofCookie(proofCookieName, proofMaxAgeSeconds, userRefreshToken);
        }, intervalMs);
        return () => {
            clearInterval(handle);
        };
    }, [bindingEnabled, userRefreshToken, proofCookieName, proofMaxAgeSeconds]);

    useEffect(() => {
        const { user, loading } = state;
        if (loading || isWhiteListed) return;

        if (!user) {
            if (!isAuthPage && confirmedSignedOut) router.replace(withRedirectQuery(fa.redirectAuthPath, window.location.search));
        } else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            router.replace(withRedirectQuery(fa.verifyEmailPath, window.location.search));
        } else if (isAuthPage || (fa.verifyEmailPath && user.emailVerified && pathname === fa.verifyEmailPath)) {
            router.replace(withRedirectQuery(fa.homePath, window.location.search));
        }
    }, [state, pathname, isAuthPage, isWhiteListed, confirmedSignedOut, fa, router]);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        let idleHandle: number | undefined;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        const subscribe = () => {
            getFirebaseAuthClient().then(async ({ auth }) => {
            if (cancelled) return;
            const { onIdTokenChanged } = await getFirebaseAuthModule();

            unsubscribe = onIdTokenChanged(auth, async (user: User | null) => {
                    if (isLoggingOutRef.current) {
                        return;
                    }

                    const previous = syncedSignedIn.current;
                    const isSignedIn = user !== null;

                    let liveRefreshToken: string | undefined;
                    try {
                        liveRefreshToken = user?.refreshToken;
                    } catch {
                        liveRefreshToken = undefined;
                    }

                    if (bindingEnabled && !proofRefreshAttempted.current && getCookie(proofRequiredCookieName) === '1') {
                        proofRefreshAttempted.current = true;
                        if (user && liveRefreshToken) {
                            const existingKey = await getDeviceKey(false);
                            if (existingKey) {
                                await writeProofCookie(proofCookieName, proofMaxAgeSeconds, liveRefreshToken);
                                setCookie({ name: proofRequiredCookieName, value: '', maxAge: 0 });
                                setState(current => (current.loading ? current : { ...current, loading: true }));
                                router.refresh();
                                return;
                            } else {
                                const newKey = await getDeviceKey(true);
                                if (newKey) {
                                    const idToken = await user.getIdToken();
                                    const res = await syncSessionAction({
                                        idToken,
                                        refreshToken: liveRefreshToken,
                                        devicePublicJwk: newKey.publicJwk,
                                    });
                                    if (res.status === 'synced') {
                                        await writeProofCookie(proofCookieName, proofMaxAgeSeconds, liveRefreshToken);
                                        setCookie({ name: proofRequiredCookieName, value: '', maxAge: 0 });
                                        setState(current => (current.loading ? current : { ...current, loading: true }));
                                        router.refresh();
                                        return;
                                    } else if (res.status === 'rebind-refused') {
                                        if (fa.onReauthRequired) {
                                            await fa.onReauthRequired();
                                        } else {
                                            setAuthUserCache(null);
                                            setState({ user: null, loading: false });
                                            setConfirmedSignedOut(true);
                                            await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, true);
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (bindingEnabled && user && liveRefreshToken) {
                        void writeProofCookie(proofCookieName, proofMaxAgeSeconds, liveRefreshToken);
                    }

                    if (!user && !restoreAttemptedRef.current && hasServerSessionMarker()) {
                        restoreAttemptedRef.current = true;
                        setState(current => (current.loading ? current : { ...current, loading: true }));
                        try {
                            let res = await restoreSessionAction();
                            if (res.status === 'proof-required' && bindingEnabled) {
                                let splitRt: string | undefined;
                                try {
                                    splitRt = auth.currentUser?.refreshToken;
                                } catch {
                                    splitRt = undefined;
                                }
                                const wrote = await writeProofCookie(proofCookieName, proofMaxAgeSeconds, splitRt);
                                if (wrote) {
                                    res = await restoreSessionAction();
                                }
                            }
                            if (res.status === 'restored') {
                                const { signInWithCustomToken } = await getFirebaseAuthModule();
                                await getAppCheckToken();
                                await signInWithCustomToken(auth, res.customToken);
                                return;
                            }
                            if (res.status === 'invalid' || res.status === 'no-session') {
                                setAuthUserCache(null);
                                setState({ user: null, loading: false });
                                setConfirmedSignedOut(true);
                                await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, true);
                            } else {
                                setAuthUserCache(null);
                                setState({ user: null, loading: false });
                                await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, false);
                            }
                        } catch (e) {
                            console.error('AuthUserProvider: restoreSessionAction failed', e);
                            setAuthUserCache(null);
                            setState({ user: null, loading: false });
                            await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, false);
                        }
                    } else {
                        if (user) {
                            if (isAuthPageRef.current) {
                                try {
                                    await writeSession(user, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, appCheckTokenMaxAge);
                                } catch (e) {
                                    console.error('AuthUserProvider: session sync failed', e);
                                    return;
                                }
                                setAuthUserCache(user);
                                setState({ user, loading: false });
                            } else {
                                setAuthUserCache(user);
                                setState({ user, loading: false });
                                void writeSession(user, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, appCheckTokenMaxAge).catch((e) => {
                                    console.error('AuthUserProvider: session sync failed', e);
                                });
                            }
                        } else {
                            setAuthUserCache(null);
                            setState({ user: null, loading: false });
                            try {
                                await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, shouldClearServerCookies(previous, initialSignedIn, isAuthPageRef.current));
                            } catch (e) {
                                console.error('AuthUserProvider: session sync failed', e);
                                return;
                            }
                        }
                    }

                    syncedSignedIn.current = isSignedIn;

                    if (user) {
                        consecutiveNulls.current = 0;
                        setConfirmedSignedOut(false);
                        signOutCallbackFired.current = false;

                        if (!signInCallbackFired.current) {
                            signInCallbackFired.current = true;
                            try {
                                await fa.onSignIn?.(user);
                            } catch (e) {
                                console.error('AuthUserProvider: onSignIn callback failed', e);
                            }
                        }

                        if (!emailVerifiedRef.current && user.emailVerified) {
                            emailVerifiedRef.current = true;
                            try {
                                await fa.onEmailVerified?.(user);
                            } catch (e) {
                                console.error('AuthUserProvider: onEmailVerified callback failed', e);
                            }
                        } else {
                            emailVerifiedRef.current = user.emailVerified;
                        }
                    } else {
                        consecutiveNulls.current += 1;
                        signInCallbackFired.current = false;

                        if (consecutiveNulls.current >= 2) {
                            setConfirmedSignedOut(true);
                            if (!signOutCallbackFired.current) {
                                signOutCallbackFired.current = true;
                                try {
                                    await fa.onSignOut?.();
                                } catch (e) {
                                    console.error('AuthUserProvider: onSignOut callback failed', e);
                                }
                            }
                        }
                    }

                    const flipped = previous !== undefined && previous !== isSignedIn;
                    const contradictsPage = !isWhiteListed && previous === undefined && isSignedIn === isAuthPage;

                    if (flipped || contradictsPage) {
                        routerRef.current.refresh();
                    }
                });
            }).catch((e) => {
                console.error('AuthUserProvider: subscribe failed', e);
            });
        };

        if (deferAuthSubscribe) {
            setState(current => (current.loading ? { ...current, loading: false } : current));
            const idle = (window as Window & {
                requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            }).requestIdleCallback;
            if (idle) idleHandle = idle(() => { if (!cancelled) void subscribe(); }, { timeout: AUTH_SUBSCRIBE_IDLE_TIMEOUT_MS });
            else timeoutHandle = setTimeout(() => { if (!cancelled) void subscribe(); }, AUTH_SUBSCRIBE_FALLBACK_DELAY_MS);
        } else {
            void subscribe();
        }

        return () => {
            cancelled = true;
            if (idleHandle !== undefined) (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(idleHandle);
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
            unsubscribe?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSignedIn, deferAuthSubscribe, isAuthPage, isWhiteListed, sessionCookieName, refreshTokenMaxAge, refreshTokenCookieName, emailVerifiedHintCookieName, appCheckTokenCookieName, appCheckTokenMaxAge, fa, bindingEnabled, proofCookieName, proofMaxAgeSeconds, proofRequiredCookieName]);

    const reloadUser = useCallback(async () => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
        try {
            const { reload } = await getFirebaseAuthModule();
            await getAppCheckToken();
            await reload(user);

            await writeSession(user, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, appCheckTokenMaxAge);

            if (!emailVerifiedRef.current && user.emailVerified) {
                emailVerifiedRef.current = true;
                try {
                    await fa.onEmailVerified?.(user);
                } catch (e) {
                    console.error('AuthUserProvider: onEmailVerified callback failed', e);
                }
            } else {
                emailVerifiedRef.current = user.emailVerified;
            }

            setAuthUserCache(user);
            setState({ user, loading: false });
        } catch (e) {
            console.error('AuthUserProvider: reloadUser failed', e);
        }
    }, [fa, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, appCheckTokenMaxAge]);

    const sendVerificationEmail = useCallback(async (actionCodeSettings?: AuthActionCodeSettings) => {
        const { auth } = await getFirebaseAuthClient();
        const user = auth.currentUser;
        if (!user) return;
        const { sendEmailVerification } = await getFirebaseAuthModule();
        await getAppCheckToken();
        await sendEmailVerification(user, actionCodeSettings);
    }, []);

    const logout = useCallback(async () => {
        isLoggingOutRef.current = true;
        setCookie({ name: sessionMarkerCookieName, value: '', maxAge: 0 });
        setCookie({ name: proofCookieName, value: '', maxAge: 0 });
        setCookie({ name: proofRequiredCookieName, value: '', maxAge: 0 });
        setAuthUserCache(null);
        setState({ user: null, loading: false });
        try {
            if (fa.deviceBinding) {
                await resetDeviceKey();
            }
            const { auth } = await getFirebaseAuthClient();
            const { signOut } = await getFirebaseAuthModule();
            await signOut(auth);
        } finally {
            await clearSession(emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge);
            if (!isWhiteListed) router.push(fa.redirectAuthPath);
        }
    }, [fa, router, emailVerifiedHintCookieName, appCheckTokenCookieName, refreshTokenMaxAge, isWhiteListed, sessionMarkerCookieName, proofCookieName, proofRequiredCookieName]);

    return <AuthUserContext.Provider value={{ ...state, reloadUser, sendVerificationEmail, logout }}>
        {children}
    </AuthUserContext.Provider>;
}
