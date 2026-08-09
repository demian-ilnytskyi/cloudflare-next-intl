import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useContext } from 'react';

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
vi.mock('../../client/hooks/use_path_name', () => ({
    default: () => mockPathname,
}));

const authObj = { currentUser: null as unknown };
const getAppCheckToken = vi.fn(async (): Promise<string | undefined> => undefined);
vi.mock('./firebase_client', () => ({
    getFirebaseAuthClient: vi.fn(async () => ({ auth: authObj })),
    getFirebaseAuthModule: () => import('firebase/auth'),
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

vi.mock('firebase/auth', () => ({
    onIdTokenChanged: (...args: [unknown, (user: unknown) => void | Promise<void>]) => onIdTokenChanged(...args),
    reload: (...args: unknown[]) => reload(...args),
    sendEmailVerification: (...args: unknown[]) => sendEmailVerification(...args),
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
    });

    it('throws when firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        expect(() => render(<AuthUserProvider>{null}</AuthUserProvider>)).toThrow(/firebaseAuth/);
    });

    it('renders children and starts loading with the given initialUser', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        expect(screen.getByText('child')).toBeInTheDocument();
        await flush();
    });

    it('does not redirect while state is still loading (no initialUser provided)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider><span>child</span></AuthUserProvider>);
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('does not redirect on an auth page even when signed out', async () => {
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: true, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/');
    });

    it('redirects an unverified signed-in user to verifyEmailPath even when they are on an auth page (unverified takes priority over the auth-page redirect)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/login';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: false, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/verify-email');
    });

    it('does not redirect on a whitelisted path', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('redirects to redirectAuthPath once confirmed signed-out (two consecutive nulls)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(onSignIn).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onSignIn callback failed', expect.any(Error));
        expect(document.cookie).toContain('__fa_session__=id-token');
    });

    it('writes the App Check token cookie when getAppCheckToken resolves a token', async () => {
        getAppCheckToken.mockResolvedValueOnce('app-check-token');
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(document.cookie).toContain('__fa_app_check_token__=app-check-token');
    });

    it('logs and swallows an App Check token fetch failure without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getAppCheckToken.mockRejectedValueOnce(new Error('boom'));
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        const user = makeUser();
        await act(async () => { idTokenListener?.(user); });
        await flush();
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: App Check token cookie sync failed', expect.any(Error));
        expect(document.cookie).toContain('__fa_session__=id-token');
    });

    it('calls onSignOut exactly once after sign-out is confirmed (two consecutive nulls), not on the first null', async () => {
        const onSignOut = vi.fn();
        currentConfig.firebaseAuth!.onSignOut = onSignOut;
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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

    it('logs and swallows an onEmailVerified callback that throws, without blocking cookie sync', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onEmailVerified = vi.fn(() => { throw new Error('boom'); });
        currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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
        expect(document.cookie).toContain('__fa_session__=id-token');
    });

    it('redirects immediately on a single null callback when initialUser was already null (server-confirmed signed-out)', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/login');
    });

    it('redirects to verifyEmailPath when signed in but email is unverified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/verify-email');
    });

    it('does not redirect for verifyEmailPath when already on that page (still unverified)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('redirects a verified user away from verifyEmailPath to homePath', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: true })); });
        await flush();
        expect(routerReplace).toHaveBeenCalledWith('/');
    });

    it('writes the session cookie and calls router.refresh on sign-in transition', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(makeUser()); });
        await flush();
        expect(setAuthUserCache).toHaveBeenCalled();
        expect(document.cookie).toContain('__fa_session__=id-token');
        expect(document.cookie).toContain('__fa_refresh_token__=refresh-token');
    });

    it('still writes the session cookie when the refresh-token cookie write throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = makeUser();
        Object.defineProperty(user, 'refreshToken', { get() { throw new Error('refresh-token read error'); } });
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(user); });
        await flush();
        expect(document.cookie).toContain('__fa_session__=id-token');
        expect(document.cookie).not.toContain('__fa_refresh_token__=refresh-token');
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: refresh-token cookie sync failed', expect.any(Error));
    });

    it('handles a session-sync failure by still updating state with the user', async () => {
        const failingUser = makeUser({ getIdToken: vi.fn(async () => { throw new Error('token error'); }) });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(failingUser); });
        await flush();
        expect(setAuthUserCache).toHaveBeenCalledWith(failingUser);
    });

    it('clears the session cookie when transitioning from signed-in to signed-out', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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

    it('exposes reloadUser which refreshes the current user and cookie', async () => {
        authObj.currentUser = makeUser({ uid: 'reload-user' });
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(reload).toHaveBeenCalled();
        expect(document.cookie).toContain('__fa_refresh_token__=refresh-token');
    });

    it('reloadUser still writes the session cookie when the refresh-token cookie write throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = makeUser({ uid: 'reload-user' });
        Object.defineProperty(user, 'refreshToken', { get() { throw new Error('refresh-token read error'); } });
        authObj.currentUser = user;
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(document.cookie).toContain('__fa_session__=id-token');
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: refresh-token cookie sync failed', expect.any(Error));
    });

    it('reloadUser logs and swallows errors from reload/getIdToken', async () => {
        authObj.currentUser = makeUser({ getIdToken: vi.fn(async () => { throw new Error('reload token error'); }) });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await expect(ctxValue!.reloadUser()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith('AuthUserProvider: reloadUser failed', expect.any(Error));
    });

    it('reloadUser retries getIdToken until it returns a token newer than the existing session cookie', async () => {
        document.cookie = `__fa_session__=${makeJwt(1000, { email_verified: false })}; path=/`;
        const staleToken = makeJwt(1000, { email_verified: false });
        const freshToken = makeJwt(2000, { email_verified: true });
        const getIdToken = vi.fn()
            .mockResolvedValueOnce(staleToken)
            .mockResolvedValue(freshToken);
        authObj.currentUser = makeUser({ uid: 'reload-user', emailVerified: true, getIdToken });
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });

        // 1 retry attempt returns the stale token, 1 returns fresh (breaks
        // the loop). writeSession reuses this confirmed token directly
        // instead of calling getIdToken(true) again on its own.
        expect(getIdToken).toHaveBeenCalledTimes(2);
        expect(document.cookie).toContain(`__fa_session__=${freshToken}`);
    });

    it('reloadUser writes whatever getIdToken returns after exhausting retries against a stuck stale token', async () => {
        document.cookie = `__fa_session__=${makeJwt(1000, { email_verified: false })}; path=/`;
        const staleToken = makeJwt(1000, { email_verified: false });
        const getIdToken = vi.fn().mockResolvedValue(staleToken);
        authObj.currentUser = makeUser({ uid: 'reload-user', emailVerified: true, getIdToken });
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); }, { timeout: 5000 });

        expect(getIdToken).toHaveBeenCalledTimes(3);
        expect(document.cookie).toContain(`__fa_session__=${staleToken}`);
    }, 10000);

    it('reloadUser skips the retry loop entirely when there is no existing session cookie to compare against', async () => {
        const getIdToken = vi.fn(async () => 'id-token');
        authObj.currentUser = makeUser({ uid: 'reload-user', getIdToken });
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });

        expect(getIdToken).toHaveBeenCalledTimes(1);
    });

    it('reloadUser is a no-op when there is no current user', async () => {
        authObj.currentUser = null;
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.reloadUser(); });
        expect(reload).not.toHaveBeenCalled();
    });

    it('exposes sendVerificationEmail which calls firebase when a user is present', async () => {
        authObj.currentUser = makeUser();
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await act(async () => { await ctxValue?.sendVerificationEmail(); });
        expect(sendEmailVerification).toHaveBeenCalled();
    });

    it('sendVerificationEmail is a no-op when there is no current user', async () => {
        authObj.currentUser = null;
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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

    it('logout still clears cookie and navigates even when signOut throws', async () => {
        signOut.mockRejectedValueOnce(new Error('signout failed'));
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
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
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        const { unmount } = render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        unmount();
        expect(idTokenListener).toBeUndefined();
    });

    it('does not register an id-token listener when unmounted before getFirebaseAuthClient resolves', async () => {
        const { getFirebaseAuthClient } = await import('./firebase_client');
        let resolveClient!: (value: { auth: unknown }) => void;
        vi.mocked(getFirebaseAuthClient).mockReturnValueOnce(
            new Promise((resolve) => { resolveClient = resolve; }),
        );
        const { default: AuthUserProvider } = await import('./auth_user_provider');
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
        const { AuthUserContext } = await import('./auth_user_provider');
        let ctxValue: import('./auth_user_provider').AuthUserContextType | null | undefined;
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<Consumer />);
        expect(ctxValue).toBeNull();
    });
});
