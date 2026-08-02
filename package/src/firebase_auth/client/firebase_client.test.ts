import { describe, it, expect, vi, beforeEach } from 'vitest';

const baseConfig = {
    firebaseAuth: {
        apiKey: 'key',
        authDomain: 'domain',
        projectId: 'proj',
        appId: 'app',
        redirectAuthPath: '/login',
        homePath: '/',
        isAuthPath: () => false,
    },
};

vi.mock('@intl-config', () => ({ default: baseConfig }));

const initializeApp = vi.fn(() => ({ name: 'app' }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: 'existing-app' }));
const getAuth = vi.fn(() => ({ currentUser: null }));

vi.mock('firebase/app', () => ({
    initializeApp: (...args: unknown[]) => initializeApp(...args),
    getApps: () => getApps(),
    getApp: () => getApp(),
}));
vi.mock('firebase/auth', () => ({
    getAuth: (...args: unknown[]) => getAuth(...args),
}));

describe('getFirebaseAuthClient', () => {
    beforeEach(() => {
        vi.resetModules();
        initializeApp.mockClear();
        getApps.mockClear();
        getApp.mockClear();
        getAuth.mockClear();
    });

    it('initializes a new firebase app when none already exists', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client');
        const { app, auth } = await getFirebaseAuthClient();
        expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'key', projectId: 'proj' }));
        expect(getApp).not.toHaveBeenCalled();
        expect(app).toBeDefined();
        expect(auth).toBeDefined();
    });

    it('reuses an existing firebase app instead of initializing a new one', async () => {
        getApps.mockReturnValue([{ name: 'existing-app' }]);
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(getApp).toHaveBeenCalled();
        expect(initializeApp).not.toHaveBeenCalled();
    });

    it('returns the same cached client on subsequent calls without re-initializing', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client');
        const first = await getFirebaseAuthClient();
        const second = await getFirebaseAuthClient();
        expect(second).toBe(first);
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('dedupes concurrent calls onto a single in-flight promise', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client');
        const [a, b] = await Promise.all([getFirebaseAuthClient(), getFirebaseAuthClient()]);
        expect(a).toBe(b);
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('exposes getFirebaseAuthClientSync as undefined before resolution and cached after', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient, getFirebaseAuthClientSync } = await import('./firebase_client');
        expect(getFirebaseAuthClientSync()).toBeUndefined();
        await getFirebaseAuthClient();
        expect(getFirebaseAuthClientSync()).toBeDefined();
    });
});

describe('getFirebaseAuthModule', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('memoizes the firebase/auth import', async () => {
        const { getFirebaseAuthModule } = await import('./firebase_client');
        const first = getFirebaseAuthModule();
        const second = getFirebaseAuthModule();
        expect(second).toBe(first);
        const mod = await first;
        expect(mod.getAuth).toBeDefined();
    });
});

describe('getFirebaseAuthClient when firebaseAuth is not configured', () => {
    it('throws instead of silently no-op-ing', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: {} }));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await expect(getFirebaseAuthClient()).rejects.toThrow(/firebaseAuth/);
    });
});
