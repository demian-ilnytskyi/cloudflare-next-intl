// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fa: { sessionCookieName?: string; appCheck?: unknown } & Record<string, unknown> = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};

function makeToken(value: string, expInSeconds = Math.floor(Date.now() / 1000) + 3600): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: expInSeconds, sub: value })).toString('base64url');
    return `${header}.${payload}.sig`;
}
const validToken = makeToken('valid-token');

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

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('refreshes an expired session token via the refresh-token cookie and proceeds', async () => {
        const expiredToken = makeToken('expired', Math.floor(Date.now() / 1000) - 3600);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: validToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        cookieGet.mockImplementation((name: string) => {
            if (name === '__fa_refresh_token__') return { value: 'old-refresh-token' };
            if (name === '__fa_session__') return { value: expiredToken };
            return undefined;
        });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(fetchMock).toHaveBeenCalled();
        expect(result.currentUser).toEqual({ uid: 'u1' });
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: undefined });
    });

    it('returns null user when the session token is expired and there is no refresh token to fall back to', async () => {
        const expiredToken = makeToken('expired', Math.floor(Date.now() / 1000) - 3600);
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_refresh_token__' ? undefined : { value: expiredToken },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
        expect(initializeServerApp).not.toHaveBeenCalled();
    });

    it('returns null user when the session token is expired and the refresh attempt fails', async () => {
        const expiredToken = makeToken('expired', Math.floor(Date.now() / 1000) - 3600);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        vi.stubGlobal('fetch', fetchMock);
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_refresh_token__' ? { value: 'old-refresh-token' } : { value: expiredToken },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
        expect(initializeServerApp).not.toHaveBeenCalled();
    });

    it('returns null user when no session cookie is present', async () => {
        cookieGet.mockReturnValue(undefined);
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
        expect(initializeApp).not.toHaveBeenCalled();
    });

    it('resolves the current user from a valid session cookie', async () => {
        cookieGet.mockReturnValue({ value: validToken });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result.currentUser).toEqual({ uid: 'u1' });
        expect(result.firebaseServerApp).toBeDefined();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: validToken });
    });

    it('forwards the App Check token cookie as appCheckToken, distinct from the session cookie', async () => {
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? { value: 'ac-token' } : { value: validToken },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: 'ac-token' });
    });

    it('omits appCheckToken when no App Check cookie is present and minting is unconfigured/fails', async () => {
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? undefined : { value: validToken },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).toHaveBeenCalledWith('proj', 'key', undefined);
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: undefined });
    });

    it('falls back to a server-minted App Check token when the cookie is absent', async () => {
        fa.appCheck = { clientEmail: 'sa@proj.iam.gserviceaccount.com', privateKey: 'pk', appId: '1:1:web:1' };
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? undefined : { value: validToken },
        );
        mintServerAppCheckToken.mockResolvedValue('minted-token');
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).toHaveBeenCalledWith('proj', 'key', fa.appCheck);
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: 'minted-token' });
    });

    it('does not attempt to mint when the App Check cookie is already present', async () => {
        fa.appCheck = { clientEmail: 'sa@proj.iam.gserviceaccount.com', privateKey: 'pk', appId: '1:1:web:1' };
        cookieGet.mockImplementation((name: string) =>
            name === '__fa_app_check_token__' ? { value: 'ac-token' } : { value: validToken },
        );
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: validToken, appCheckToken: 'ac-token' });
    });

    it('does not attempt to mint when there is no session cookie at all', async () => {
        cookieGet.mockReturnValue(undefined);
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
    });

    it('initializes the base app only once across repeated calls', async () => {
        cookieGet.mockReturnValue({ value: validToken });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('reads the session from a custom sessionCookieName instead of the default __fa_session__', async () => {
        fa.sessionCookieName = '__session';
        cookieGet.mockReturnValue({ value: validToken });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(cookieGet).toHaveBeenCalledWith('__session');
        expect(cookieGet).not.toHaveBeenCalledWith('__fa_session__');
        expect(result.currentUser).toEqual({ uid: 'u1' });
    });

    it('returns null user/app when the Firebase call throws', async () => {
        cookieGet.mockReturnValue({ value: validToken });
        getAuth.mockImplementation(() => {
            throw new Error('invalid token');
        });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        const result = await getAuthenticatedAppForUser();
        expect(result).toEqual({ firebaseServerApp: null, currentUser: null });
    });
});
