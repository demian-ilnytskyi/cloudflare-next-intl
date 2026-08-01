// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fa = {
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

describe('getAuthenticatedAppForUser', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        cookieGet.mockReturnValue(undefined);
        getAuth.mockReturnValue({ authStateReady, currentUser: { uid: 'u1' } });
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
        expect(initializeServerApp).toHaveBeenCalledWith(expect.anything(), { authIdToken: 'valid-token' });
    });

    it('initializes the base app only once across repeated calls', async () => {
        cookieGet.mockReturnValue({ value: 'valid-token' });
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        await getAuthenticatedAppForUser();
        expect(initializeApp).toHaveBeenCalledTimes(1);
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
