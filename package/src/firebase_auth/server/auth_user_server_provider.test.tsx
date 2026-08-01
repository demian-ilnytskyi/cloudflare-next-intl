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
        headersGet.mockReturnValue('/dashboard');
    });

    it('redirects guests to redirectAuthPath when the page is not an auth page', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
    });

    it('redirects signed-in users away from auth pages to homePath', async () => {
        headersGet.mockReturnValue('/login');
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: null } as never,
        });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/');
    });

    it('returns the serialized user without redirecting for a signed-in non-auth page', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: 'Alice' } as never,
        });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toEqual({ uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: 'Alice' });
    });

    it('returns null without redirecting for a guest on an auth page', async () => {
        headersGet.mockReturnValue('/login');
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toBeNull();
    });

    it('skips all redirect logic for whitelisted paths', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/dashboard'];
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        const result = await resolveAuthUserAndRedirect();
        expect(result).toBeNull();
        expect(redirect).not.toHaveBeenCalled();
    });

    it('defaults to "/" when x-pathname header is missing', async () => {
        headersGet.mockReturnValue(null);
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({ firebaseServerApp: null, currentUser: null });
        const { resolveAuthUserAndRedirect } = await import('./auth_user_server_provider');
        await expect(resolveAuthUserAndRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
    });
});

describe('AuthUserServerProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
        headersGet.mockReturnValue('/dashboard');
    });

    it('resolves the user and renders children inside the client AuthUserProvider', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'u1', email: 'a@b.com', emailVerified: true, displayName: null } as never,
        });
        const { default: AuthUserServerProvider } = await import('./auth_user_server_provider');
        render(await AuthUserServerProvider({ children: <span>child</span> }));
        expect(await screen.findByTestId('client-provider')).toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });
});
