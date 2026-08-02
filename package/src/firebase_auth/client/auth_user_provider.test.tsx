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
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
}));

let mockPathname = '/dashboard';
vi.mock('../../client/hooks/use_path_name', () => ({
    default: () => mockPathname,
}));

const authObj = { currentUser: null as unknown };
vi.mock('./firebase_client', () => ({
    getFirebaseAuthClient: vi.fn(async () => ({ auth: authObj })),
}));

const setAuthUserCache = vi.fn();
vi.mock('./auth_user_cache', () => ({
    setAuthUserCache: (...args: unknown[]) => setAuthUserCache(...args),
}));

const setSessionCookie = vi.fn(async () => {});
const clearSessionCookie = vi.fn(async () => {});
vi.mock('../middleware/session_cookie_action', () => ({
    setSessionCookie: (...args: unknown[]) => setSessionCookie(...args),
    clearSessionCookie: (...args: unknown[]) => clearSessionCookie(...args),
}));

let idTokenListener: ((user: unknown) => void | Promise<void>) | undefined;
const onIdTokenChanged = vi.fn((_auth: unknown, cb: (user: unknown) => void | Promise<void>) => {
    idTokenListener = cb;
    return () => { idTokenListener = undefined; };
});
const reload = vi.fn(async () => {});
const sendEmailVerification = vi.fn(async () => {});
const signOut = vi.fn(async () => {});

vi.mock('firebase/auth', () => ({
    onIdTokenChanged: (...args: [unknown, (user: unknown) => void | Promise<void>]) => onIdTokenChanged(...args),
    reload: (...args: unknown[]) => reload(...args),
    sendEmailVerification: (...args: unknown[]) => sendEmailVerification(...args),
    signOut: (...args: unknown[]) => signOut(...args),
}));

function makeUser(overrides: Partial<{ uid: string; emailVerified: boolean; getIdToken: () => Promise<string> }> = {}) {
    return {
        uid: 'u1',
        emailVerified: true,
        getIdToken: vi.fn(async () => 'id-token'),
        ...overrides,
    };
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
        render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: false, displayName: null }}>
            <span>child</span>
        </AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        await act(async () => { idTokenListener?.(null); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
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

    it('does not redirect for verifyEmailPath when already on that page', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        mockPathname = '/verify-email';
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
        await flush();
        expect(routerReplace).not.toHaveBeenCalled();
    });

    it('writes the session cookie and calls router.refresh on sign-in transition', async () => {
        const { default: AuthUserProvider } = await import('./auth_user_provider');
        render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
        await flush();
        await act(async () => { await idTokenListener?.(makeUser()); });
        await flush();
        expect(setSessionCookie).toHaveBeenCalledWith('id-token', undefined);
        expect(setAuthUserCache).toHaveBeenCalled();
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
        expect(setSessionCookie).toHaveBeenCalledWith('id-token');
    });

    it('reloadUser logs and swallows errors from reload/getIdToken/setSessionCookie', async () => {
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
        const assign = vi.fn();
        Object.defineProperty(window, 'location', { value: { assign }, writable: true });
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
        expect(assign).toHaveBeenCalledWith('/login');
    });

    it('logout still clears cookie and navigates even when signOut throws', async () => {
        signOut.mockRejectedValueOnce(new Error('signout failed'));
        const assign = vi.fn();
        Object.defineProperty(window, 'location', { value: { assign }, writable: true });
        let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
        const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
        function Consumer() {
            ctxValue = useContext(AuthUserContext);
            return null;
        }
        render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
        await flush();
        await expect(ctxValue!.logout()).rejects.toThrow('signout failed');
        expect(assign).toHaveBeenCalledWith('/login');
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
