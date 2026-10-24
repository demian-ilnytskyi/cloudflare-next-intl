import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import type { AuthUserContextType } from './auth_user_provider.js';

const fa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path: string) => path === '/login',
};

let currentConfig: { firebaseAuth?: typeof fa & Record<string, unknown> };

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

const routerReplace = vi.fn();
const routerRefresh = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: routerReplace, refresh: routerRefresh, push: routerPush }),
}));

let mockPathname = '/dashboard';
vi.mock('cloudflare-next-intl-intl/usePathname', () => ({
    default: () => mockPathname,
}));

const authObj = { currentUser: null as unknown };
const getAppCheckToken = vi.fn(async (): Promise<string | undefined> => undefined);
vi.mock('./firebase_client', () => ({
    getFirebaseAuthClient: vi.fn(async () => ({ auth: authObj })),
    getFirebaseAuthModule: () => import('@firebase/auth'),
    getAppCheckToken: (...args: unknown[]) => getAppCheckToken(...args),
}));

const setAuthUserCache = vi.fn();
vi.mock('./auth_user_cache', () => ({
    setAuthUserCache: (...args: unknown[]) => setAuthUserCache(...args),
}));

let idTokenListener: ((user: unknown) => void | Promise<void>) | undefined;
const onIdTokenChanged = vi.fn((_auth: unknown, cb: (user: unknown) => void | Promise<void>) => {
    idTokenListener = cb;
    return () => { idTokenListener = undefined; };
});
const reload = vi.fn(async () => {});
const sendEmailVerification = vi.fn(async () => {});
const signOut = vi.fn(async () => {});
const clearSessionAction = vi.fn(async () => {});
vi.mock('../server/clear_session_action', () => ({
    default: (...args: unknown[]) => clearSessionAction(...args),
}));
const syncSessionAction = vi.fn(async () => ({ status: 'synced' as const }));
vi.mock('../server/sync_session_action', () => ({
    default: (...args: unknown[]) => syncSessionAction(...args),
}));
const restoreSessionAction = vi.fn(async () => ({ status: 'no-session' as const }));
vi.mock('../server/restore_session_action', () => ({
    default: (...args: unknown[]) => restoreSessionAction(...args),
}));

const getDeviceKeyMock = vi.fn();
const resetDeviceKeyMock = vi.fn();
const isDeviceKeyUnsupportedMock = vi.fn(() => false);
vi.mock('./device_key.js', () => ({
    getDeviceKey: (...args: unknown[]) => getDeviceKeyMock(...args),
    resetDeviceKey: (...args: unknown[]) => resetDeviceKeyMock(...args),
    isDeviceKeyUnsupported: () => isDeviceKeyUnsupportedMock(),
}));

import type * as DeviceProofModule from '../device_proof.js';

const createDeviceProofMock = vi.fn(async () => 'mock-proof-sig');
vi.mock('../device_proof.js', async (importOriginal) => {
    const actual = await importOriginal<typeof DeviceProofModule>();
    return {
        ...actual,
        createDeviceProof: (...args: unknown[]) => createDeviceProofMock(...args),
    };
});

const signInWithCustomToken = vi.fn(async () => {});
vi.mock('@firebase/auth', () => ({
    onIdTokenChanged: (...args: [unknown, (user: unknown) => void | Promise<void>]) => onIdTokenChanged(...args),
    reload: (...args: unknown[]) => reload(...args),
    sendEmailVerification: (...args: unknown[]) => sendEmailVerification(...args),
    signInWithCustomToken: (...args: unknown[]) => signInWithCustomToken(...args),
    signOut: (...args: unknown[]) => signOut(...args),
}));

function makeUser(overrides: Partial<{ uid: string; emailVerified: boolean; getIdToken: () => Promise<string>; refreshToken: string }> = {}) {
    return {
        uid: 'u1',
        emailVerified: true,
        refreshToken: 'refresh-token',
        getIdToken: vi.fn(async () => 'id-token'),
        ...overrides,
    };
}

function makeJwt(iat: number, claims: Record<string, unknown> = {}): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat, ...claims })).toString('base64url');
    return `${header}.${payload}.sig`;
}

function clearAllCookies() {
    document.cookie.split(';').forEach((c) => {
        const name = c.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; max-age=0; path=/`;
    });
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('AuthUserProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
        mockPathname = '/dashboard';
        idTokenListener = undefined;
        clearAllCookies();
        // The provider defers its `onIdTokenChanged` subscription to idle for
        // signed-out visitors on public pages; run the callback inline so the
        // assertions below stay synchronous.
        (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback =
            (cb: () => void) => { cb(); return 0; };
    });

    it('throws when firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        expect(() => render(<AuthUserProvider>{null}</AuthUserProvider>)).toThrow(/firebaseAuth/);
    });

    it('renders children and starts loading with the given initialUser', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        expect(screen.getByText('child')).toBeInTheDocument();
        await flush();
    });

    it('does not redirect while state is still loading (no initialUser provided)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider><span>child</span></AuthUserProvider>);
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('clears loading immediately when it defers the subscription, so consumers do not render blank until idle', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/public'];
        mockPathname = '/public';
        let idleCallback: (() => void) | undefined;
        (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback =
            (cb: () => void) => { idleCallback = cb; return 7; };
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Probe() {
            const ctx = useContext(AuthUserContext) as AuthUserContextType;
            return <span>{ctx.loading ? 'loading' : 'settled'}</span>;
        }
        render(<AuthUserProvider initialUser={null}><Probe /></AuthUserProvider>);
        await flush();
        expect(onIdTokenChanged).not.toHaveBeenCalled();
        expect(screen.getByText('settled')).toBeInTheDocument();
        await act(async () => { idleCallback?.(); });
        await flush();
        expect(onIdTokenChanged).toHaveBeenCalled();
    });

    it('subscribes immediately on a non-whitelisted page even when signed out', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/public'];
        mockPathname = '/dashboard';
        (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback =
            () => { throw new Error('must not defer on a protected page'); };
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        expect(onIdTokenChanged).toHaveBeenCalled();
    });

    it('falls back to a timer when requestIdleCallback is unavailable, and clears it on unmount', async () => {
        vi.useFakeTimers();
        try {
            currentConfig.firebaseAuth!.whiteListPaths = ['/public'];
            mockPathname = '/public';
            delete (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback;
            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            const { unmount } = render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            expect(onIdTokenChanged).not.toHaveBeenCalled();
            unmount();
            await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
            expect(onIdTokenChanged).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancels a pending idle callback on unmount', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/public'];
        mockPathname = '/public';
        const cancelIdleCallback = vi.fn();
        (window as Window & {
            requestIdleCallback?: (cb: () => void) => number;
            cancelIdleCallback?: (handle: number) => void;
        }).requestIdleCallback = () => 42;
        (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback = cancelIdleCallback;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { unmount } = render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        unmount();
        expect(cancelIdleCallback).toHaveBeenCalledWith(42);
    });

    it('does not redirect on an auth page even when signed out', async () => {
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('redirects a signed-in user away from an auth page to homePath', async () => {
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: true, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/');
    });

    it('redirects an unverified signed-in user to verifyEmailPath even when they are on an auth page (unverified takes priority over the auth-page redirect)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: false, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/verify-email');
    });

    it('does not redirect on a whitelisted path', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('does not refresh on a whitelisted path when signed out', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        await flush();
        expect(routerRefresh).not.toHaveBeenCalled();
    });

    it('still refreshes on a whitelisted path when the signed-in state actually flips', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        await flush();
        await act(async () => { await idTokenListener?.(makeUser()); });
        await flush();
        expect(routerRefresh).toHaveBeenCalled();
    });

    it('does not redirect a public path when protectedPaths is set (denylist mode derives the whitelist)', async () => {
        currentConfig.firebaseAuth!.protectedPaths = (path: string) => path === '/profile';
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('still redirects a protectedPaths-matched page once confirmed signed-out', async () => {
        currentConfig.firebaseAuth!.protectedPaths = (path: string) => path === '/profile';
        mockPathname = '/profile';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/login');
    });

    it('redirects to redirectAuthPath once confirmed signed-out (two consecutive nulls)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/login');
    });

    it('calls onSignIn exactly once on a real sign-in, not on a subsequent token refresh of the same user', async () => {
        const onSignIn = vi.fn();
        currentConfig.firebaseAuth!.onSignIn = onSignIn;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(onSignIn).toHaveBeenCalledTimes(1);
        expect(onSignIn).toHaveBeenCalledWith(user);

        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(onSignIn).toHaveBeenCalledTimes(1);
    });

    it('does not call onSignIn when signed out (null callback)', async () => {
        const onSignIn = vi.fn();
        currentConfig.firebaseAuth!.onSignIn = onSignIn;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(onSignIn).not.toHaveBeenCalled();
    });

    it('logs and swallows an onSignIn callback that throws, without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onSignIn = vi.fn(() => { throw new Error('boom'); });
        currentConfig.firebaseAuth!.onSignIn = onSignIn;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(onSignIn).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onSignIn callback failed', expect.any(Error));
        expect(syncSessionAction).toHaveBeenCalled();
    });

    it('writes the App Check token cookie when getAppCheckToken resolves a token', async () => {
        getAppCheckToken.mockResolvedValueOnce('app-check-token');
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(document.cookie).toContain('__fa_app_check_token__=app-check-token');
    });

    it('writes the App Check cookie with maxAge from the token exp', async () => {
        const cookieSpy = vi.spyOn(document, 'cookie', 'set');
        const nowSeconds = Math.floor(Date.now() / 1000);
        const exp = nowSeconds + 1800;
        const token = makeJwt(nowSeconds, { exp });
        getAppCheckToken.mockResolvedValueOnce(token);

        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();

        const call = cookieSpy.mock.calls.find((c) => c[0].startsWith('__fa_app_check_token__='));
        expect(call).toBeDefined();
        expect(call![0]).toMatch(/max-age=(?:1739|1740|1741);/);
        cookieSpy.mockRestore();
    });

    it('logs and swallows an App Check token fetch failure without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getAppCheckToken.mockRejectedValueOnce(new Error('boom'));
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: App Check token cookie sync failed', expect.any(Error));
        expect(syncSessionAction).toHaveBeenCalled();
    });

    it('calls onSignOut exactly once after sign-out is confirmed (two consecutive nulls), not on the first null', async () => {
        const onSignOut = vi.fn();
        currentConfig.firebaseAuth!.onSignOut = onSignOut;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={makeUser()}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(onSignOut).not.toHaveBeenCalled();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('does not call onSignOut when initialUser was already null (no real transition — already signed out at mount)', async () => {
        const onSignOut = vi.fn();
        currentConfig.firebaseAuth!.onSignOut = onSignOut;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(onSignOut).not.toHaveBeenCalled();
    });

    it('logs and swallows an onSignOut callback that throws, without blocking the redirect', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onSignOut = vi.fn(() => { throw new Error('boom'); });
        currentConfig.firebaseAuth!.onSignOut = onSignOut;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={makeUser()}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(onSignOut).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onSignOut callback failed', expect.any(Error));
    });

    it('calls onEmailVerified exactly once on the false→true transition via onIdTokenChanged, not again on a later observation', async () => {
        const onEmailVerified = vi.fn();
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();

        const unverifiedUser = makeUser({ emailVerified: false });
        await act(async () => { idTokenListener?.(unverifiedUser); });
        await flush();
        expect(onEmailVerified).not.toHaveBeenCalled();

        const verifiedUser = makeUser({ emailVerified: true });
        await act(async () => { idTokenListener?.(verifiedUser); });
        await flush();
        expect(onEmailVerified).toHaveBeenCalledTimes(1);
        expect(onEmailVerified).toHaveBeenCalledWith(verifiedUser);

        await act(async () => { idTokenListener?.(verifiedUser); });
        await flush();
        expect(onEmailVerified).toHaveBeenCalledTimes(1);
    });

    it('does not call onEmailVerified when the initial user is already verified (no prior unverified observation)', async () => {
        const onEmailVerified = vi.fn();
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: true, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        const verifiedUser = makeUser({ emailVerified: true });
        await act(async () => { idTokenListener?.(verifiedUser); });
        await flush();
        expect(onEmailVerified).not.toHaveBeenCalled();
    });

    it('calls onEmailVerified exactly once via reloadUser\'s false→true transition', async () => {
        const onEmailVerified = vi.fn();
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        const unverifiedUser = makeUser({ emailVerified: false });
        authObj.currentUser = unverifiedUser;
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(unverifiedUser); });
        await flush();
        expect(onEmailVerified).not.toHaveBeenCalled();

        authObj.currentUser = makeUser({ uid: 'u1', emailVerified: true });
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(onEmailVerified).toHaveBeenCalledTimes(1);

        await act(async () => { await ctxValue?.reloadUser(); });
        expect(onEmailVerified).toHaveBeenCalledTimes(1);
    });

    it('redirects to homePath when reloadUser flips emailVerified on the SAME user object', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const user = makeUser({ emailVerified: false });
        authObj.currentUser = user;
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        routerReplace.mockClear();

        reload.mockImplementationOnce(async () => { user.emailVerified = true; });
        await act(async () => { await ctxValue?.reloadUser(); });
        await flush();

        expect(routerReplace).toHaveBeenCalledWith('/');
    });

    it('logs and swallows an onEmailVerified callback that throws, without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onEmailVerified = vi.fn(() => { throw new Error('boom'); });
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: true })); });
        await flush();
        expect(onEmailVerified).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onEmailVerified callback failed', expect.any(Error));
    });

    it('logs and swallows an onEmailVerified callback that throws via reloadUser, without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onEmailVerified = vi.fn(() => { throw new Error('boom'); });
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        const unverifiedUser = makeUser({ emailVerified: false });
        authObj.currentUser = unverifiedUser;
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(unverifiedUser); });
        await flush();

        authObj.currentUser = makeUser({ uid: 'u1', emailVerified: true });
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(onEmailVerified).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onEmailVerified callback failed', expect.any(Error));
        expect(syncSessionAction).toHaveBeenCalled();
    });

    it('redirects immediately on a single null callback when initialUser was already null (server-confirmed signed-out)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/login');
    });

    it('redirects to verifyEmailPath when signed in but email is unverified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/verify-email');
    });

    it('does not redirect for verifyEmailPath when already on that page (still unverified)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('redirects a verified user away from verifyEmailPath to homePath', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: true })); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/');
    });

    it('does not write session or refresh cookies from the client', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(makeUser()); });
        await flush();
        expect(setAuthUserCache).toHaveBeenCalled();
        expect(document.cookie).not.toContain('__fa_session__=');
        expect(document.cookie).not.toContain('__fa_refresh_token__=');
        expect(document.cookie).not.toContain('__fa_has_session__=');
        expect(syncSessionAction).toHaveBeenCalledWith({
            idToken: 'id-token',
            refreshToken: 'refresh-token',
        });
    });

    it('still syncs session when the refresh-token getter throws on user object', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = makeUser();
        Object.defineProperty(user, 'refreshToken', { get() { throw new Error('refresh-token read error'); } });
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(user); });
        await flush();
        expect(setAuthUserCache).toHaveBeenCalled();
    });

    it('handles a session-sync failure by still updating state with the user', async () => {
        const failingUser = makeUser({ getIdToken: vi.fn(async () => { throw new Error('token error'); }) });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(failingUser); });
        await flush();
        expect(setAuthUserCache).toHaveBeenCalledWith(failingUser);
    });

    it('clears the session cookie when transitioning from signed-in to signed-out', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(makeUser()); });
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        await flush();
        expect(routerRefresh).toHaveBeenCalled();
        expect(document.cookie).not.toContain('__fa_refresh_token__=refresh-token');
    });

    it('clears the server httpOnly cookie via clearSessionAction when the client Firebase SDK reports signed-out on its own (no logout() click), so a stale server session cookie cannot outlive a real client sign-out', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={{ uid: 'server-user', email: null, emailVerified: true, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        // Server resolved a signed-in initialUser, but the client Firebase SDK
        // has no persisted session — onIdTokenChanged fires null on mount,
        // with no prior signed-in state and no logout() call at all.
        await act(async () => { await idTokenListener?.(null); });
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        await flush();
        expect(clearSessionAction).toHaveBeenCalled();
    });

    it('exposes reloadUser which refreshes the current user and calls sync', async () => {
        authObj.currentUser = makeUser({ uid: 'reload-user', refreshToken: 'reload-refresh-token' });
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(reload).toHaveBeenCalled();
        expect(syncSessionAction).toHaveBeenCalled();
    });

    it('reloadUser logs and swallows errors from reload', async () => {
        authObj.currentUser = makeUser({ uid: 'reload-user' });
        reload.mockRejectedValueOnce(new Error('reload error'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await expect(ctxValue!.reloadUser()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: reloadUser failed', expect.any(Error));
    });

    it('reloadUser is a no-op when there is no current user', async () => {
        authObj.currentUser = null;
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(reload).not.toHaveBeenCalled();
    });

    it('exposes sendVerificationEmail which calls firebase with actionCodeSettings when present', async () => {
        authObj.currentUser = makeUser();
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        const settings = { url: 'https://example.com/verify' };
        await act(async () => { await ctxValue?.sendVerificationEmail(settings); });
        expect(sendEmailVerification).toHaveBeenCalledWith(authObj.currentUser, settings);
    });


    it('sendVerificationEmail is a no-op when there is no current user', async () => {
        authObj.currentUser = null;
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.sendVerificationEmail(); });
        expect(sendEmailVerification).not.toHaveBeenCalled();
    });

    it('exposes logout which signs out, clears cookie, and navigates to redirectAuthPath', async () => {
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.logout(); });
        expect(signOut).toHaveBeenCalled();
        expect(routerPush).toHaveBeenCalledWith('/login');
        expect(document.cookie).not.toContain('__fa_refresh_token__=refresh-token');
    });

    it('logout clears the session but does not navigate on a whitelisted path', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.logout(); });
        expect(signOut).toHaveBeenCalled();
        expect(routerPush).not.toHaveBeenCalled();
        expect(document.cookie).not.toContain('__fa_refresh_token__=refresh-token');
    });

    it('logout still clears cookie and navigates even when signOut throws', async () => {
        signOut.mockRejectedValueOnce(new Error('signout failed'));
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await expect(ctxValue!.logout()).rejects.toThrow('signout failed');
        expect(routerPush).toHaveBeenCalledWith('/login');
    });

    it('logout calls the server-side clearSessionAction to clear httpOnly cookies', async () => {
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.logout(); });
        expect(clearSessionAction).toHaveBeenCalledTimes(1);
        expect(routerPush).toHaveBeenCalledWith('/login');
    });

    it('logout still navigates when clearSessionAction rejects', async () => {
        clearSessionAction.mockRejectedValueOnce(new Error('server action failed'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.logout(); });
        expect(routerPush).toHaveBeenCalledWith('/login');
    });

    it('unsubscribes the id-token listener and cancels pending work on unmount', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { unmount } = render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        unmount();
        expect(idTokenListener).toBeUndefined();
    });

    it('does not register an id-token listener when unmounted before getFirebaseAuthClient resolves', async () => {
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        let resolveClient!: (value: { auth: unknown }) => void;
        vi.mocked(getFirebaseAuthClient).mockReturnValueOnce(
            new Promise((resolve) => { resolveClient = resolve; }),
        );
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { unmount } = render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        unmount();
        await act(async () => {
            resolveClient({ auth: authObj });
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(onIdTokenChanged).not.toHaveBeenCalled();
    });

    it('the default context value is null for consumers outside a provider', async () => {
        const { AuthUserContext } = await import('./auth_user_provider.js');
        let ctxValue: AuthUserContextType | null | undefined;
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<Consumer />);
        expect(ctxValue).toBeNull();
    });

    it('calls clearSessionAction on an auth page when the SDK resolves to null', async () => {
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        expect(clearSessionAction).toHaveBeenCalledTimes(1);
    });

    it('skips clearSessionAction for an anonymous visitor on a public page', async () => {
        mockPathname = '/';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(null); });
        expect(clearSessionAction).not.toHaveBeenCalled();
    });

    it('redirects a signed-in SDK user off /login to homePath', async () => {
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(makeUser({ emailVerified: true })); });
        expect(routerReplace).toHaveBeenCalledWith('/');
    });


    it('restores the user instead of redirecting when the marker is set', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { encodeSessionMarker } = await import('../session_marker.js');
        const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok');
        document.cookie = `__fa_has_session__=${marker}; path=/`;

        restoreSessionAction.mockResolvedValueOnce({ status: 'restored', customToken: 'custom-jwt' });

        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });

        expect(restoreSessionAction).toHaveBeenCalledTimes(1);
        expect(signInWithCustomToken).toHaveBeenCalledWith(authObj, 'custom-jwt');
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('keeps loading true while the restore is in flight', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { default: useAuthUser } = await import('./use_auth_user.js');
        const { encodeSessionMarker } = await import('../session_marker.js');
        const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok');
        document.cookie = `__fa_has_session__=${marker}; path=/`;

        let resolveRestore!: (val: unknown) => void;
        restoreSessionAction.mockReturnValueOnce(new Promise((resolve) => {
            resolveRestore = resolve;
        }));

        let stateSnapshot: { loading: boolean; user: unknown } | undefined;
        function Consumer() {
            stateSnapshot = useAuthUser();
            return null;
        }

        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => {
            void idTokenListener?.(null);
        });

        expect(stateSnapshot?.loading).toBe(true);
        expect(routerReplace).not.toHaveBeenCalled();

        await act(async () => {
            resolveRestore({ status: 'restored', customToken: 'token' });
        });
    });

    it('clears the server session and redirects when restore answers invalid', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { encodeSessionMarker } = await import('../session_marker.js');
        const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok');
        document.cookie = `__fa_has_session__=${marker}; path=/`;

        restoreSessionAction.mockResolvedValueOnce({ status: 'invalid' });

        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });

        expect(clearSessionAction).toHaveBeenCalledTimes(1);
        expect(routerReplace).toHaveBeenCalledWith(expect.stringContaining('/login'));
    });

    it('keeps the server pair when restore is unavailable', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { encodeSessionMarker } = await import('../session_marker.js');
        const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok');
        document.cookie = `__fa_has_session__=${marker}; path=/`;

        restoreSessionAction.mockResolvedValueOnce({ status: 'unavailable' });

        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });

        expect(clearSessionAction).not.toHaveBeenCalled();
        expect(document.cookie).toContain('__fa_has_session__=');
    });

    it('attempts restore at most once per mount', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        const { encodeSessionMarker } = await import('../session_marker.js');
        const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok');
        document.cookie = `__fa_has_session__=${marker}; path=/`;

        restoreSessionAction.mockResolvedValue({ status: 'unavailable' });

        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });
        await act(async () => {
            await idTokenListener?.(null);
        });

        expect(restoreSessionAction).toHaveBeenCalledTimes(1);
    });

    it('does not call clearSessionAction for a never-signed-in visitor', async () => {
        mockPathname = '/dashboard';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });
        expect(clearSessionAction).not.toHaveBeenCalled();
    });

    it('does not clear on a deferred whitelisted page without a marker', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/public'];
        mockPathname = '/public';
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => {
            await idTokenListener?.(null);
        });
        expect(clearSessionAction).not.toHaveBeenCalled();
    });

    it('exposes the user before the App Check cookie sync settles', async () => {
        getAppCheckToken.mockReturnValueOnce(new Promise(() => {}));
        let ctxValue: AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();

        const user = makeUser({ uid: 'u-fast' });
        act(() => {
            void idTokenListener?.(user);
        });

        expect(ctxValue?.loading).toBe(false);
        expect(ctxValue?.user?.uid).toBe('u-fast');
    });

    it('calls syncSessionAction while the App Check sync is still pending', async () => {
        getAppCheckToken.mockReturnValueOnce(new Promise(() => {}));
        const { default: AuthUserProvider } = await import('./auth_user_provider.js');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();

        const user = makeUser({ uid: 'u-fast-cookie', getIdToken: vi.fn(async () => 'fast-session-token') });
        await act(async () => {
            void idTokenListener?.(user);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(syncSessionAction).toHaveBeenCalledWith(expect.objectContaining({
            idToken: 'fast-session-token',
        }));
    });

    describe('device binding', () => {
        const dummyKey = {
            publicJwk: { kty: 'EC', crv: 'P-256', x: 'x1', y: 'y1' },
            sign: vi.fn(async () => 'sig1'),
        };

        beforeEach(() => {
            currentConfig.firebaseAuth!.deviceBinding = {
                store: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
                proofMaxAgeSeconds: 120,
            };
            getDeviceKeyMock.mockResolvedValue(dummyKey);
            createDeviceProofMock.mockResolvedValue('1000.sig1');
        });

        it('writes proof cookie on user callback and refreshes it at half proofMaxAge', async () => {
            vi.useFakeTimers();
            try {
                const { default: AuthUserProvider } = await import('./auth_user_provider.js');
                render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
                await flush();

                const user = makeUser({ uid: 'u-bound', refreshToken: 'ref-bound' });
                await act(async () => {
                    await idTokenListener?.(user);
                });

                expect(createDeviceProofMock).toHaveBeenCalledWith(dummyKey, 'ref-bound', expect.any(Number));
                expect(document.cookie).toContain('__fa_device_proof__=1000.sig1');

                createDeviceProofMock.mockClear();
                // Advance timer by proofMaxAgeSeconds / 2 (60 seconds)
                await act(async () => {
                    vi.advanceTimersByTime(60 * 1000);
                    await Promise.resolve();
                    await Promise.resolve();
                });

                expect(createDeviceProofMock).toHaveBeenCalledWith(dummyKey, 'ref-bound', expect.any(Number));
            } finally {
                vi.useRealTimers();
            }
        });

        it('calls router.refresh at most once per mount for proof-required', async () => {
            document.cookie = '__fa_proof_required__=1; path=/';
            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            await flush();

            const user = makeUser({ uid: 'u-proof', refreshToken: 'ref-p' });
            await act(async () => {
                await idTokenListener?.(user);
            });
            await act(async () => {
                await idTokenListener?.(user);
            });

            expect(routerRefresh).toHaveBeenCalledTimes(1);
            expect(document.cookie).not.toContain('__fa_proof_required__=1');
            expect(document.cookie).toContain('__fa_device_proof__=1000.sig1');
        });

        it('does not reset the device key on an SDK null', async () => {
            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            await flush();

            await act(async () => {
                await idTokenListener?.(null);
            });

            expect(resetDeviceKeyMock).not.toHaveBeenCalled();
        });

        it('resets the device key on explicit logout', async () => {
            let ctxValue: AuthUserContextType | undefined;
            const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider.js');
            function Consumer() {
                ctxValue = useContext(AuthUserContext);
                return null;
            }
            render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
            await flush();

            await act(async () => {
                await ctxValue?.logout();
            });

            expect(resetDeviceKeyMock).toHaveBeenCalledTimes(1);
        });

        it('re-binds a lost key after a fresh sign-in when server asks for proof', async () => {
            document.cookie = '__fa_proof_required__=1; path=/';
            // getDeviceKey(false) returns null (key lost), getDeviceKey(true) creates a fresh key
            getDeviceKeyMock.mockImplementation((create?: boolean) => {
                if (create) return Promise.resolve(dummyKey);
                return Promise.resolve(null);
            });

            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            await flush();

            const user = makeUser({ uid: 'u-lost-key', refreshToken: 'ref-lost' });
            syncSessionAction.mockResolvedValueOnce({ status: 'synced' });

            await act(async () => {
                await idTokenListener?.(user);
            });

            expect(syncSessionAction).toHaveBeenCalledWith(expect.objectContaining({
                refreshToken: 'ref-lost',
                devicePublicJwk: dummyKey.publicJwk,
            }));
            expect(routerRefresh).toHaveBeenCalledTimes(1);
            expect(document.cookie).not.toContain('__fa_proof_required__=1');
        });

        it('calls onReauthRequired when server refuses rebind on lost key', async () => {
            document.cookie = '__fa_proof_required__=1; path=/';
            getDeviceKeyMock.mockImplementation((create?: boolean) => {
                if (create) return Promise.resolve(dummyKey);
                return Promise.resolve(null);
            });

            const onReauth = vi.fn(async () => {});
            currentConfig.firebaseAuth!.onReauthRequired = onReauth;

            syncSessionAction.mockResolvedValueOnce({ status: 'rebind-refused' });

            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            await flush();

            const user = makeUser({ uid: 'u-rebind-refused', refreshToken: 'ref-refused' });
            await act(async () => {
                await idTokenListener?.(user);
            });

            expect(onReauth).toHaveBeenCalledTimes(1);
        });

        it('retries restore once when restore answers proof-required and currentUser refreshToken is present', async () => {
            const { encodeSessionMarker } = await import('../session_marker.js');
            const marker = await encodeSessionMarker(Math.floor(Date.now() / 1000) + 3600, 'tok', true);
            document.cookie = `__fa_has_session__=${marker}; path=/`;

            authObj.currentUser = makeUser({ uid: 'u-split', refreshToken: 'ref-split' });

            restoreSessionAction
                .mockResolvedValueOnce({ status: 'proof-required' })
                .mockResolvedValueOnce({ status: 'restored', customToken: 'token-abc' });

            const { default: AuthUserProvider } = await import('./auth_user_provider.js');
            render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
            await flush();

            await act(async () => {
                await idTokenListener?.(null);
            });

            expect(createDeviceProofMock).toHaveBeenCalledWith(dummyKey, 'ref-split', expect.any(Number));
            expect(restoreSessionAction).toHaveBeenCalledTimes(2);
            expect(signInWithCustomToken).toHaveBeenCalledWith(authObj, 'token-abc');
        });
    });
});
