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
const initializeAppCheck = vi.fn(() => ({}));
const ReCaptchaV3Provider = vi.fn(function (this: unknown, siteKey: string) {
    return { siteKey };
});
const ReCaptchaEnterpriseProvider = vi.fn(function (this: unknown, siteKey: string) {
    return { siteKey };
});

vi.mock('firebase/app', () => ({
    initializeApp: (...args: unknown[]) => initializeApp(...args),
    getApps: () => getApps(),
    getApp: () => getApp(),
}));
vi.mock('firebase/auth', () => ({
    getAuth: (...args: unknown[]) => getAuth(...args),
}));
const getToken = vi.fn(() => Promise.resolve({ token: 'app-check-token' }));

vi.mock('firebase/app-check', () => ({
    initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
    ReCaptchaV3Provider,
    ReCaptchaEnterpriseProvider,
    getToken: (...args: unknown[]) => getToken(...args),
}));

describe('getFirebaseAuthClient', () => {
    beforeEach(() => {
        vi.resetModules();
        initializeApp.mockClear();
        getApps.mockClear();
        getApp.mockClear();
        getAuth.mockClear();
        initializeAppCheck.mockClear();
        ReCaptchaV3Provider.mockClear();
        ReCaptchaEnterpriseProvider.mockClear();
        delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
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

describe('getFirebaseAuthClient App Check', () => {
    beforeEach(() => {
        vi.resetModules();
        initializeApp.mockClear();
        getApps.mockReturnValue([]);
        getApp.mockClear();
        getAuth.mockClear();
        initializeAppCheck.mockClear();
        ReCaptchaV3Provider.mockClear();
        ReCaptchaEnterpriseProvider.mockClear();
        delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    });

    it('does not initialize App Check when appCheck is not configured', async () => {
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(initializeAppCheck).not.toHaveBeenCalled();
    });

    it('initializes App Check with a reCAPTCHA v3 provider when configured', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
        );
    });

    it('sets the debug token flag before initializing when debugToken is true', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key', debugToken: true },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    });

    it('initializes App Check with a reCAPTCHA Enterprise provider when configured', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaEnterpriseSiteKey: 'enterprise-key', isTokenAutoRefreshEnabled: false },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('enterprise-key');
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: false }),
        );
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

describe('getAppCheckToken', () => {
    beforeEach(() => {
        vi.resetModules();
        getApps.mockReturnValue([]);
        getToken.mockClear();
    });

    it('returns undefined when App Check is not configured', async () => {
        const { getAppCheckToken } = await import('./firebase_client');
        await expect(getAppCheckToken()).resolves.toBeUndefined();
        expect(getToken).not.toHaveBeenCalled();
    });

    it('returns the token once App Check has initialized', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client');
        await getFirebaseAuthClient();
        await expect(getAppCheckToken()).resolves.toBe('app-check-token');
        expect(getToken).toHaveBeenCalled();
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
