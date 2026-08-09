// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fa: { sessionCookieName?: string; appCheck?: unknown } & Record<string, unknown> = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};

const cookieGet = vi.fn();
vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: cookieGet })),
}));

const initializeApp = vi.fn(() => ({ name: 'base-app' }));
const initializeServerApp = vi.fn(() => ({ name: 'server-app' }));
const authStateReady = vi.fn(async () => {});
const getAuth = vi.fn(() => ({ authStateReady, currentUser: { uid: 'u1' } }));

vi.mock('firebase/app', () => ({
    initializeApp: (...args: unknown[]) => initializeApp(...args),
    initializeServerApp: (...args: unknown[]) => initializeServerApp(...args),
}));
vi.mock('firebase/auth', () => ({
    getAuth: (...args: unknown[]) => getAuth(...args),
}));

const mintServerAppCheckToken = vi.fn(async () => undefined as string | undefined);
vi.mock('./mint_server_app_check_token', () => ({
    default: (...args: unknown[]) => mintServerAppCheckToken(...args),
}));

describe('getAuthenticatedAppForUser', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        cookieGet.mockReturnValue(undefined);
        getAuth.mockReturnValue({ authStateReady, currentUser: { uid: 'u1' } });
        mintServerAppCheckToken.mockResolvedValue(undefined);
        delete fa.sessionCookieName;
        delete fa.appCheck;
    });

    it('returns null user when no session cookie is present', async () => {
        cookieGet.mockReturnValue(undefined);
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
        expect(initializeApp).not.toHaveBeenCalled();
    });

    it('resolves the current user from a valid session cookie', async () => {
        cookieGet.mockReturnValue({ value: 'valid-token' });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result.currentUser).toEqual({ uid: 'u1' });
        expect(result.firebaseServerApp).toBeDefined();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token', appCheckToken: 'valid-token' });
    });

    it('forwards the App Check token cookie as appCheckToken, distinct from the session cookie', async () => {
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? { value: 'ac-token' } : { value: 'valid-token' },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token', appCheckToken: 'ac-token' });
    });

    it('omits appCheckToken when no App Check cookie is present and minting is unconfigured/fails', async () => {
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? undefined : { value: 'valid-token' },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).toHaveBeenCalledWith('proj', 'key', undefined);
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token', appCheckToken: undefined });
    });

    it('falls back to a server-minted App Check token when the cookie is absent', async () => {
        fa.appCheck = { clientEmail: 'sa@proj.iam.gserviceaccount.com', privateKey: 'pk', appId: '1:1:web:1' };
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? undefined : { value: 'valid-token' },
        );
        mintServerAppCheckToken.mockResolvedValue('minted-token');
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).toHaveBeenCalledWith('proj', 'key', fa.appCheck);
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token', appCheckToken: 'minted-token' });
    });

    it('does not attempt to mint when the App Check cookie is already present', async () => {
        fa.appCheck = { clientEmail: 'sa@proj.iam.gserviceaccount.com', privateKey: 'pk', appId: '1:1:web:1' };
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? { value: 'ac-token' } : { value: 'valid-token' },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token', appCheckToken: 'ac-token' });
    });

    it('does not attempt to mint when there is no session cookie at all', async () => {
        cookieGet.mockReturnValue(undefined);
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
    });

    it('initializes the base app only once across repeated calls', async () => {
        cookieGet.mockReturnValue({ value: 'valid-token' });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('reads the session from a custom sessionCookieName instead of the default __fa_session__', async () => {
        fa.sessionCookieName = '__session';
        cookieGet.mockReturnValue({ value: 'valid-token' });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(cookieGet).toHaveBeenCalledWith('__session');
        expect(cookieGet).not.toHaveBeenCalledWith('__fa_session__');
        expect(result.currentUser).toEqual({ uid: 'u1' });
    });

    it('returns null user/app when the Firebase call throws', async () => {
        cookieGet.mockReturnValue({ value: 'valid-token' });
        getAuth.mockImplementation(() => {
            throw new Error('invalid token');
        });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
    });
});
