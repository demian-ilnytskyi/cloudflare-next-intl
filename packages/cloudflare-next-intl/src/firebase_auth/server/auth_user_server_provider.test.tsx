import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

const headersGet = vi.fn();
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({ get: headersGet })),
}));

// `headers().get` is one mock serving both `x-pathname` and `x-search`, so it
// must answer per-header rather than returning one blanket value.
function setHeaders(pathname: string | null, search: string | null = null) {
    headersGet.mockImplementation((name: string) =>
        name === 'x-pathname' ? pathname : name === 'x-search' ? search : null);
}

const redirect = vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock('next/navigation', () => ({
    redirect: (path: string) => redirect(path),
}));

vi.mock('./firebase_server', () => ({
    getAuthenticatedAppForUser: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
        let Comp: React.ComponentType<Record<string, unknown>> | undefined;
        loader().then((m) => { Comp = m.default; });
        return function DynamicWrapper(props: Record<string, unknown>) {
            if (!Comp) return null;
            const C = Comp;
            return <C {...props} />;
        };
    },
}));

vi.mock('../client/auth_user_provider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="client-provider">{children}</div>,
}));

describe('resolveAuthUserAndRedirect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
        setHeaders('/dashboard');
    });

    it('redirects guests to redirectAuthPath when the page is not an auth page', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
    });

    it('redirects signed-in users away from auth pages to homePath', async () => {
        setHeaders('/login');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: null } as never,
        });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/');
    });

    it('returns the serialized user without redirecting for a signed-in non-auth page', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: 'Alice' } as never,
        });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toEqual({ uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: 'Alice' });
    });

    it('returns null without redirecting for a guest on an auth page', async () => {
        setHeaders('/login');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toBeNull();
    });

    it('skips all redirect logic for whitelisted paths', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toBeNull();
        expect(redirect).not.toHaveBeenCalled();
    });

    it('skips redirect logic for nested subpaths of whitelisted paths', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        setHeaders('/dashboard/subpath');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toBeNull();
        expect(redirect).not.toHaveBeenCalled();
    });

    it('defaults to "/" when x-pathname header is missing', async () => {
        setHeaders(null);
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
    });

    it('preserves the query string when redirecting a guest to redirectAuthPath', async () => {
        setHeaders('/dashboard', '?test=test&a=b');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login?test=test&a=b');
    });

    it('preserves the query string when redirecting a signed-in user to homePath', async () => {
        setHeaders('/login', '?test=test');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: null } as never,
        });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/?test=test');
    });

    it('drops the query string when preserveRedirectQuery is false', async () => {
        currentConfig.firebaseAuth!.preserveRedirectQuery = false;
        setHeaders('/dashboard', '?test=test');
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
    });

    it('throws if firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider.js');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow(/firebaseAuth/);
    });
});

describe('AuthUserServerProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
        setHeaders('/dashboard');
    });

    it('resolves the user and renders children inside the client AuthUserProvider', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: null } as never,
        });
        const { default: AuthUserServerProvider } = await import('./auth_user_server_provider.js');
        render(await AuthUserServerProvider({ children: <span>child</span> }));
        expect(await screen.findByTestId('client-provider')).toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });
});
