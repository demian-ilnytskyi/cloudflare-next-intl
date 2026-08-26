import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const appOptions = { projectId: 'proj', appId: 'app', apiKey: 'key' };
const initializeApp = vi.fn(() => ({ name: 'app', options: appOptions }));
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
const CustomProvider = vi.fn(function (this: unknown, options: unknown) {
    return { options };
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

const getPerformance = vi.fn(() => ({}));

vi.mock('firebase/performance', () => ({
    getPerformance: (...args: unknown[]) => getPerformance(...args),
}));

vi.mock('firebase/app-check', () => ({
    initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
    ReCaptchaV3Provider,
    ReCaptchaEnterpriseProvider,
    CustomProvider,
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
        CustomProvider.mockClear();
        delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    });

    it('does not initialize App Check when appCheck is not configured', async () => {
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(initializeAppCheck).not.toHaveBeenCalled();
    });

    it('initializes App Check with an explicit reCAPTCHA CustomProvider by default when a v3 key is configured', async () => {
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
        expect(CustomProvider).toHaveBeenCalledWith(expect.objectContaining({ getToken: expect.any(Function) }));
        expect(ReCaptchaV3Provider).not.toHaveBeenCalled();
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
        );
    });

    it('initializes App Check with the legacy reCAPTCHA v3 provider when useExplicitRecaptchaScript is false', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key', useExplicitRecaptchaScript: false },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
        expect(CustomProvider).not.toHaveBeenCalled();
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

describe('getFirebaseAuthClient Performance', () => {
    beforeEach(() => {
        vi.resetModules();
        getPerformance.mockClear();
    });

    it('automatically initializes performance monitoring by default on client', async () => {
        const { getFirebaseAuthClient, getFirebasePerformanceSync } = await import('./firebase_client');
        expect(getFirebasePerformanceSync()).toBeUndefined();
        await getFirebaseAuthClient();
        expect(getPerformance).toHaveBeenCalled();
        expect(getFirebasePerformanceSync()).toBeDefined();
    });

    it('does not initialize performance monitoring when performance is false', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    performance: false,
                },
            },
        }));
        const { getFirebaseAuthClient, getFirebasePerformanceSync } = await import('./firebase_client');
        await getFirebaseAuthClient();
        expect(getPerformance).not.toHaveBeenCalled();
        expect(getFirebasePerformanceSync()).toBeUndefined();
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

    it('returns undefined instead of throwing when getToken rejects', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        getToken.mockRejectedValueOnce(new Error('reCAPTCHA Timeout'));
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client');
        await getFirebaseAuthClient();
        await expect(getAppCheckToken()).resolves.toBeUndefined();
    });

    it('returns undefined instead of hanging when getToken never resolves', async () => {
        vi.useFakeTimers();
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        getToken.mockReturnValueOnce(new Promise(() => {}));
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const promise = getAppCheckToken();
        await vi.advanceTimersByTimeAsync(10_000);
        await expect(promise).resolves.toBeUndefined();
        vi.useRealTimers();
    });
});

describe('getFirebaseAuthClient App Check initialization failure', () => {
    beforeEach(() => {
        vi.resetModules();
        getApps.mockReturnValue([]);
        initializeAppCheck.mockClear();
    });

    it('continues without App Check when initializeAppCheck rejects', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        initializeAppCheck.mockImplementationOnce(() => Promise.reject(new Error('reCAPTCHA Timeout')));
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client');
        await expect(getFirebaseAuthClient()).resolves.toBeDefined();
        await expect(getAppCheckToken()).resolves.toBeUndefined();
    });
});

describe('explicit reCAPTCHA CustomProvider', () => {
    const recaptchaConfig = {
        default: {
            firebaseAuth: {
                ...baseConfig.firebaseAuth,
                appCheck: { recaptchaV3SiteKey: 'site-key' },
            },
        },
    };

    let execute: ReturnType<typeof vi.fn>;
    let render: ReturnType<typeof vi.fn>;

    function installGrecaptcha({ fail = false }: { fail?: boolean } = {}): void {
        execute = vi.fn(() => Promise.resolve('recaptcha-token'));
        render = vi.fn(
            (
                _container: HTMLElement,
                params: { callback: () => void; 'error-callback': () => void },
            ) => {
                if (fail) params['error-callback']();
                else params.callback();
                return 'widget-id';
            },
        );
        window.grecaptcha = { ready: (cb: () => void) => cb(), render, execute } as never;
    }

    function okResponse(ttl = '3600s'): { status: number; json: () => Promise<unknown> } {
        return { status: 200, json: () => Promise.resolve({ token: 'exchanged-token', ttl }) };
    }

    async function getProviderToken(): Promise<{ token: string; expireTimeMillis: number }> {
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string; expireTimeMillis: number }>;
        };
        return options.getToken();
    }

    beforeEach(() => {
        vi.resetModules();
        getApps.mockReturnValue([]);
        CustomProvider.mockClear();
        vi.doMock('@intl-config', () => recaptchaConfig);
        delete (window as { grecaptcha?: unknown }).grecaptcha;
        document.body.innerHTML = '';
    });

    afterEach(() => {
        delete (window as { grecaptcha?: unknown }).grecaptcha;
        vi.unstubAllGlobals();
    });

    it('renders an invisible widget and exchanges the reCAPTCHA token for an App Check token', async () => {
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        const before = Date.now();
        const result = await getProviderToken();
        expect(render).toHaveBeenCalledWith(
            expect.any(HTMLElement),
            expect.objectContaining({ sitekey: 'site-key', size: 'invisible' }),
        );
        expect(execute).toHaveBeenCalledWith('widget-id', { action: 'fire_app_check' });
        expect(fetch).toHaveBeenCalledWith(
            'https://content-firebaseappcheck.googleapis.com/v1/projects/proj/apps/app:exchangeRecaptchaV3Token?key=key',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ recaptcha_v3_token: 'recaptcha-token' }),
            }),
        );
        expect(result.token).toBe('exchanged-token');
        expect(result.expireTimeMillis).toBeGreaterThanOrEqual(before + 3600 * 1000);
    });

    it('appends the invisible widget container to the document once and reuses it', async () => {
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        await options.getToken();
        await options.getToken();
        expect(document.querySelectorAll('#fire_app_check_app')).toHaveLength(1);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('reuses a container that already exists in the document', async () => {
        installGrecaptcha();
        const existing = document.createElement('div');
        existing.id = 'fire_app_check_app';
        document.body.appendChild(existing);
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        await getProviderToken();
        expect(document.querySelectorAll('#fire_app_check_app')).toHaveLength(1);
        expect(render).toHaveBeenCalledWith(existing, expect.anything());
    });

    it('waits for a reCAPTCHA script that has not loaded yet', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string }>;
        };
        const pending = options.getToken();
        installGrecaptcha();
        await vi.advanceTimersByTimeAsync(100);
        await expect(pending).resolves.toEqual(expect.objectContaining({ token: 'exchanged-token' }));
        vi.useRealTimers();
    });

    it('rejects when the reCAPTCHA script never loads', async () => {
        vi.useFakeTimers();
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/never loaded/);
        await vi.advanceTimersByTimeAsync(15_000);
        await assertion;
        vi.useRealTimers();
    });

    it('does not permanently cache a failed widget setup', async () => {
        vi.useFakeTimers();
        const { getFirebaseAuthClient } = await import('./firebase_client');
        await getFirebaseAuthClient();
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string }>;
        };
        const failing = options.getToken();
        const failingAssertion = expect(failing).rejects.toThrow(/never loaded/);
        await vi.advanceTimersByTimeAsync(15_000);
        await failingAssertion;
        vi.useRealTimers();

        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        await expect(options.getToken()).resolves.toEqual(
            expect.objectContaining({ token: 'exchanged-token' }),
        );
    });

    it('throws a reCAPTCHA error when execute rejects', async () => {
        installGrecaptcha();
        execute.mockRejectedValueOnce(null);
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        await expect(getProviderToken()).rejects.toThrow('reCAPTCHA error');
    });

    it('throws a reCAPTCHA error when the widget reports failure', async () => {
        installGrecaptcha({ fail: true });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        await expect(getProviderToken()).rejects.toThrow('reCAPTCHA error');
    });

    it('throws when the token exchange responds with a non-200 status', async () => {
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ status: 403, json: () => Promise.resolve({}) })));
        await expect(getProviderToken()).rejects.toThrow('App Check token exchange failed with status 403');
    });

    it('throws when the exchange response ttl is not a protobuf duration', async () => {
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse('not-a-duration'))));
        await expect(getProviderToken()).rejects.toThrow(/Unexpected ttl format/);
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
