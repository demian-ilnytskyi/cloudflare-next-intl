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
const initializeAuth = vi.fn(() => ({ currentUser: null }));
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

vi.mock('@firebase/app', () => ({
    initializeApp: (...args: unknown[]) => initializeApp(...args),
    getApps: () => getApps(),
    getApp: () => getApp(),
}));
vi.mock('@firebase/auth', () => ({
    getAuth: (...args: unknown[]) => getAuth(...args),
    initializeAuth: (...args: unknown[]) => initializeAuth(...args),
    indexedDBLocalPersistence: 'indexedDBLocalPersistence',
    browserLocalPersistence: 'browserLocalPersistence',
    browserSessionPersistence: 'browserSessionPersistence',
}));
const getToken = vi.fn(() => Promise.resolve({ token: 'app-check-token' }));

const initializePerformance = vi.fn(() => ({}));

vi.mock('@firebase/performance', () => ({
    initializePerformance: (...args: unknown[]) => initializePerformance(...args),
}));

vi.mock('@firebase/app-check', () => ({
    initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
    ReCaptchaV3Provider,
    ReCaptchaEnterpriseProvider,
    CustomProvider,
    getToken: (...args: unknown[]) => getToken(...args),
}));

const exchangeTurnstileTokenActionMock = vi.fn();
vi.mock('../server/exchange_turnstile_token_action.js', () => ({
    default: (...args: unknown[]) => exchangeTurnstileTokenActionMock(...args),
}));

describe('getFirebaseAuthClient', () => {
    beforeEach(() => {
        vi.resetModules();
        initializeApp.mockClear();
        getApps.mockClear();
        getApp.mockClear();
        getAuth.mockClear();
        initializeAuth.mockClear();
        initializeAppCheck.mockClear();
        ReCaptchaV3Provider.mockClear();
        ReCaptchaEnterpriseProvider.mockClear();
        delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    });

    it('initializes a new firebase app when none already exists', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        const { app, auth } = await getFirebaseAuthClient();
        expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'key', projectId: 'proj' }));
        expect(getApp).not.toHaveBeenCalled();
        expect(app).toBeDefined();
        expect(auth).toBeDefined();
    });

    it('reuses an existing firebase app instead of initializing a new one', async () => {
        getApps.mockReturnValue([{ name: 'existing-app' }]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        expect(getApp).toHaveBeenCalled();
        expect(initializeApp).not.toHaveBeenCalled();
    });

    it('returns the same cached client on subsequent calls without re-initializing', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        const first = await getFirebaseAuthClient();
        const second = await getFirebaseAuthClient();
        expect(second).toBe(first);
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('dedupes concurrent calls onto a single in-flight promise', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        const [a, b] = await Promise.all([getFirebaseAuthClient(), getFirebaseAuthClient()]);
        expect(a).toBe(b);
        expect(initializeApp).toHaveBeenCalledTimes(1);
    });

    it('exposes getFirebaseAuthClientSync as undefined before resolution and cached after', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient, getFirebaseAuthClientSync } = await import('./firebase_client.js');
        expect(getFirebaseAuthClientSync()).toBeUndefined();
        await getFirebaseAuthClient();
        expect(getFirebaseAuthClientSync()).toBeDefined();
    });

    it('uses getAuth (with its default popupRedirectResolver) when skipPopupRedirectResolver is not set', async () => {
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        expect(getAuth).toHaveBeenCalledWith(expect.anything());
        expect(initializeAuth).not.toHaveBeenCalled();
    });

    it('uses initializeAuth without a popupRedirectResolver when skipPopupRedirectResolver is true', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: { ...baseConfig.firebaseAuth, skipPopupRedirectResolver: true },
            },
        }));
        getApps.mockReturnValue([]);
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        expect(initializeAuth).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                persistence: ['indexedDBLocalPersistence', 'browserLocalPersistence', 'browserSessionPersistence'],
            }),
        );
        expect(getAuth).not.toHaveBeenCalled();
    });

    it('falls back to getAuth when initializeAuth throws already-initialized', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: { ...baseConfig.firebaseAuth, skipPopupRedirectResolver: true },
            },
        }));
        getApps.mockReturnValue([]);
        initializeAuth.mockImplementationOnce(() => { throw new Error('auth/already-initialized'); });
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await expect(getFirebaseAuthClient()).resolves.toBeDefined();
        expect(getAuth).toHaveBeenCalledWith(expect.anything());
    });
});

describe('getFirebaseAuthClient App Check', () => {
    beforeEach(() => {
        vi.resetModules();
        initializeApp.mockClear();
        getApps.mockReturnValue([]);
        getApp.mockClear();
        getAuth.mockClear();
        initializeAuth.mockClear();
        initializeAppCheck.mockClear();
        ReCaptchaV3Provider.mockClear();
        ReCaptchaEnterpriseProvider.mockClear();
        CustomProvider.mockClear();
        delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    });

    it('does not initialize App Check on getFirebaseAuthClient when appCheck is not configured', async () => {
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        await getAppCheckToken();
        expect(initializeAppCheck).not.toHaveBeenCalled();
    });

    it('initializes App Check before resolving when appCheck is configured', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        const { auth } = await getFirebaseAuthClient();
        expect(auth).toBeDefined();
        expect(initializeAppCheck).toHaveBeenCalledTimes(1);
        await getFirebaseAuthClient();
        expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    });

    it('registers App Check on the app before getAuth restores the persisted user', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        expect(initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(getAuth.mock.invocationCallOrder[0]);
    });

    it('resolves without App Check when appCheck is not configured', async () => {
        vi.doMock('@intl-config', () => ({ default: baseConfig }));
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        const { auth } = await getFirebaseAuthClient();
        expect(auth).toBeDefined();
        expect(initializeAppCheck).not.toHaveBeenCalled();
    });

    it('initializes App Check only once across concurrent getAppCheckToken calls', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        const { getAppCheckToken } = await import('./firebase_client.js');
        await Promise.all([getAppCheckToken(), getAppCheckToken()]);
        expect(initializeAppCheck).toHaveBeenCalledTimes(1);
        // A call arriving after initialization has already settled hits the
        // early-return path directly, without re-entering getFirebaseAuthClient.
        await getAppCheckToken();
        expect(initializeAppCheck).toHaveBeenCalledTimes(1);
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        await getAppCheckToken();
        expect(CustomProvider).toHaveBeenCalledWith(expect.objectContaining({ getToken: expect.any(Function) }));
        expect(ReCaptchaV3Provider).not.toHaveBeenCalled();
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: false }),
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        await getAppCheckToken();
        expect(ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
        expect(CustomProvider).not.toHaveBeenCalled();
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: false }),
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        await getAppCheckToken();
        expect((globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    });

    it('initializes App Check with a reCAPTCHA Enterprise provider when configured', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaEnterpriseSiteKey: 'enterprise-key', isTokenAutoRefreshEnabled: true },
                },
            },
        }));
        const { getAppCheckToken } = await import('./firebase_client.js');
        await getAppCheckToken();
        expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('enterprise-key');
        expect(initializeAppCheck).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
        );
    });
});

describe('getFirebaseAuthClient Performance', () => {
    beforeEach(() => {
        vi.resetModules();
        initializePerformance.mockClear();
    });

    it('automatically initializes performance monitoring by default on client', async () => {
        const { getFirebaseAuthClient, getFirebasePerformanceSync } = await import('./firebase_client.js');
        expect(getFirebasePerformanceSync()).toBeUndefined();
        await getFirebaseAuthClient();
        expect(initializePerformance).toHaveBeenCalledWith(expect.anything(), { instrumentationEnabled: false });
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
        const { getFirebaseAuthClient, getFirebasePerformanceSync } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        expect(initializePerformance).not.toHaveBeenCalled();
        expect(getFirebasePerformanceSync()).toBeUndefined();
    });
});

describe('getFirebaseAuthModule', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('memoizes the firebase/auth import', async () => {
        const { getFirebaseAuthModule } = await import('./firebase_client.js');
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
        const { getAppCheckToken } = await import('./firebase_client.js');
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
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client.js');
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
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client.js');
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
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        const promise = getAppCheckToken();
        await vi.advanceTimersByTimeAsync(30_000);
        await expect(promise).resolves.toBeUndefined();
        vi.useRealTimers();
    });

    it('waits up to the given timeout for a slow token', async () => {
        vi.useFakeTimers();
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: { recaptchaV3SiteKey: 'site-key' },
                },
            },
        }));
        getToken.mockReturnValueOnce(new Promise(resolve => setTimeout(() => resolve({ token: 'slow-token' }), 40_000)));
        const { getFirebaseAuthClient, getAppCheckToken, APP_CHECK_ACTION_TIMEOUT_MS } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
        const promise = getAppCheckToken(APP_CHECK_ACTION_TIMEOUT_MS);
        await vi.advanceTimersByTimeAsync(40_000);
        await expect(promise).resolves.toBe('slow-token');
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
        const { getFirebaseAuthClient, getAppCheckToken } = await import('./firebase_client.js');
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
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
        document.cookie = '__fa_app_check_token__=; max-age=0; path=/';
    });

    afterEach(() => {
        delete (window as { grecaptcha?: unknown }).grecaptcha;
        document.cookie = '__fa_app_check_token__=; max-age=0; path=/';
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

    it('injects the explicit reCAPTCHA script on first token request, once', async () => {
        const selector = 'script[src="https://www.google.com/recaptcha/api.js?render=explicit"]';
        document.head.querySelectorAll(selector).forEach(node => node.remove());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        // Both calls stay parked in `waitForGrecaptcha` until the script is
        // installed below — exactly the window in which a second injection
        // would duplicate the tag.
        const first = options.getToken().catch(() => undefined);
        await vi.waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1));
        const second = options.getToken().catch(() => undefined);
        expect(document.head.querySelectorAll(selector)).toHaveLength(1);
        // Settle both inside this test: a promise left parked here resumes
        // during the next one and renders against its widget spy.
        installGrecaptcha();
        await Promise.all([first, second]);
        document.head.querySelectorAll(selector).forEach(node => node.remove());
    });

    it('appends the invisible widget container to the document once and reuses it', async () => {
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
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
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/never loaded/);
        await vi.advanceTimersByTimeAsync(15_000);
        await assertion;
        vi.useRealTimers();
    });

    it('rejects promptly, without waiting out the full timeout, when the injected script itself fails to load', async () => {
        const selector = 'script[src="https://www.google.com/recaptcha/api.js?render=explicit"]';
        document.head.querySelectorAll(selector).forEach(node => node.remove());
        vi.useFakeTimers();
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/never loaded/);
        document.head.querySelector(selector)?.dispatchEvent(new Event('error'));
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
        vi.useRealTimers();
        document.head.querySelectorAll(selector).forEach(node => node.remove());
    });

    it('does not permanently cache a failed widget setup', async () => {
        vi.useFakeTimers();
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
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

    function makeJwt(exp: number): string {
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
        return `${header}.${payload}.sig`;
    }

    it('returns the seeded cookie token without loading reCAPTCHA', async () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const seededToken = makeJwt(exp);
        document.cookie = `__fa_app_check_token__=${seededToken}; path=/`;
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await getProviderToken();
        expect(result.token).toBe(seededToken);
        expect(result.expireTimeMillis).toBe(exp * 1000);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect((window as { grecaptcha?: unknown }).grecaptcha).toBeUndefined();
    });

    it('falls back to reCAPTCHA when the seeded token expires within 5 minutes', async () => {
        const exp = Math.floor(Date.now() / 1000) + 120; // 2 minutes left (< 5 min)
        document.cookie = `__fa_app_check_token__=${makeJwt(exp)}; path=/`;
        installGrecaptcha();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse())));

        const result = await getProviderToken();
        expect(result.token).toBe('exchanged-token');
        expect(fetch).toHaveBeenCalled();
    });

    it('rejects after RECAPTCHA_TOKEN_TIMEOUT_MS when grecaptcha.execute never settles', async () => {
        installGrecaptcha();
        execute.mockReturnValueOnce(new Promise(() => {}));
        vi.useFakeTimers();
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string }>;
        };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow('reCAPTCHA timed out');
        await vi.advanceTimersByTimeAsync((await import('./firebase_client.js')).RECAPTCHA_TOKEN_TIMEOUT_MS);
        await assertion;
        vi.useRealTimers();
    });
});

describe('getFirebaseAuthClient when firebaseAuth is not configured', () => {
    it('throws instead of silently no-op-ing', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: {} }));
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await expect(getFirebaseAuthClient()).rejects.toThrow(/firebaseAuth/);
    });

    it('returns undefined from getAppCheckToken instead of rejecting', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: {} }));
        const { getAppCheckToken } = await import('./firebase_client.js');
        await expect(getAppCheckToken()).resolves.toBeUndefined();
    });
});

describe('Turnstile CustomProvider', () => {
    const turnstileConfig = {
        default: {
            firebaseAuth: {
                ...baseConfig.firebaseAuth,
                appCheck: { turnstileSiteKey: 'cf-site-key' },
            },
        },
    };

    let turnstileExecute: ReturnType<typeof vi.fn>;
    let turnstileRender: ReturnType<typeof vi.fn>;
    let turnstileReset: ReturnType<typeof vi.fn>;

    function installTurnstile({ fail = false, timeout = false, token = 'turnstile-token' }: { fail?: boolean; timeout?: boolean; token?: string } = {}): void {
        let capturedParams: {
            callback?: (t: string) => void;
            'error-callback'?: () => void;
            'timeout-callback'?: () => void;
        } = {};
        turnstileExecute = vi.fn((_widgetId?: string) => {
            if (fail) capturedParams['error-callback']?.();
            else if (timeout) capturedParams['timeout-callback']?.();
            else capturedParams.callback?.(token);
        });
        turnstileRender = vi.fn((_container: HTMLElement | string, params: typeof capturedParams) => {
            capturedParams = params;
            return 'turnstile-widget-id';
        });
        turnstileReset = vi.fn((_widgetId: string) => {});
        (window as { turnstile?: unknown }).turnstile = {
            render: turnstileRender,
            execute: turnstileExecute,
            reset: turnstileReset,
        };
    }

    function makeJwt(exp: number): string {
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
        return `${header}.${payload}.sig`;
    }

    async function getTurnstileProviderToken(): Promise<{ token: string; expireTimeMillis: number }> {
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string; expireTimeMillis: number }>;
        };
        return options.getToken();
    }

    beforeEach(() => {
        vi.resetModules();
        getApps.mockReturnValue([]);
        CustomProvider.mockClear();
        ReCaptchaV3Provider.mockClear();
        ReCaptchaEnterpriseProvider.mockClear();
        exchangeTurnstileTokenActionMock.mockClear();
        vi.doMock('@intl-config', () => turnstileConfig);
        delete (window as { turnstile?: unknown }).turnstile;
        document.body.innerHTML = '';
        document.cookie = '__fa_app_check_token__=; max-age=0; path=/';
    });

    afterEach(() => {
        delete (window as { turnstile?: unknown }).turnstile;
        document.cookie = '__fa_app_check_token__=; max-age=0; path=/';
        document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach(node => node.remove());
        vi.unstubAllGlobals();
    });

    it('uses the seeded cookie without injecting the Turnstile script', async () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const seededToken = makeJwt(exp);
        document.cookie = `__fa_app_check_token__=${seededToken}; path=/`;

        const result = await getTurnstileProviderToken();
        expect(result.token).toBe(seededToken);
        expect(result.expireTimeMillis).toBe(exp * 1000);
        expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
        expect((window as { turnstile?: unknown }).turnstile).toBeUndefined();
        expect(exchangeTurnstileTokenActionMock).not.toHaveBeenCalled();
    });

    it('injects the Turnstile script once and renders one widget for concurrent getToken calls', async () => {
        const selector = 'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]';
        exchangeTurnstileTokenActionMock.mockResolvedValue({
            status: 'ok',
            token: 'minted-app-check-token',
            expireTimeMillis: 999999999,
        });

        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string; expireTimeMillis: number }>;
        };

        const first = options.getToken();
        await vi.waitFor(() => expect(document.querySelectorAll(selector)).toHaveLength(1));
        const second = options.getToken();
        expect(document.querySelectorAll(selector)).toHaveLength(1);

        installTurnstile();
        const [res1, res2] = await Promise.all([first, second]);
        expect(res1.token).toBe('minted-app-check-token');
        expect(res2.token).toBe('minted-app-check-token');
        expect(turnstileRender).toHaveBeenCalledTimes(1);
    });

    it('returns the exchanged App Check token with its expiry', async () => {
        installTurnstile();
        exchangeTurnstileTokenActionMock.mockResolvedValueOnce({
            status: 'ok',
            token: 'minted-app-check-token',
            expireTimeMillis: 1800000000000,
        });

        const result = await getTurnstileProviderToken();
        expect(result.token).toBe('minted-app-check-token');
        expect(result.expireTimeMillis).toBe(1800000000000);
        expect(turnstileRender).toHaveBeenCalledWith(
            expect.any(HTMLElement),
            expect.objectContaining({
                sitekey: 'cf-site-key',
                appearance: 'interaction-only',
                execution: 'execute',
                action: 'fire_app_check',
            }),
        );
        expect(turnstileExecute).toHaveBeenCalledWith('turnstile-widget-id');
        expect(turnstileReset).toHaveBeenCalledWith('turnstile-widget-id');
        expect(exchangeTurnstileTokenActionMock).toHaveBeenCalledWith('turnstile-token');
    });

    it('rejects when the exchange answers rejected', async () => {
        installTurnstile();
        exchangeTurnstileTokenActionMock.mockResolvedValueOnce({ status: 'rejected' });

        await expect(getTurnstileProviderToken()).rejects.toThrow(/rejected/);
        expect(turnstileReset).toHaveBeenCalledWith('turnstile-widget-id');
    });

    describe('with a reCAPTCHA v3 fallback key', () => {
        beforeEach(() => {
            vi.doMock('@intl-config', () => ({
                default: {
                    firebaseAuth: {
                        ...baseConfig.firebaseAuth,
                        appCheck: { turnstileSiteKey: 'cf-site-key', recaptchaV3SiteKey: 'site-key' },
                    },
                },
            }));
            window.grecaptcha = {
                ready: (cb: () => void) => cb(),
                render: (_c: HTMLElement, p: { callback: () => void }) => { p.callback(); return 'widget-id'; },
                execute: () => Promise.resolve('recaptcha-token'),
            } as never;
        });

        afterEach(() => {
            delete (window as { grecaptcha?: unknown }).grecaptcha;
        });

        it('falls back to reCAPTCHA v3 when the Turnstile challenge fails', async () => {
            installTurnstile({ fail: true });
            vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
                status: 200,
                json: () => Promise.resolve({ token: 'recaptcha-app-check-token', ttl: '3600s' }),
            })));

            const result = await getTurnstileProviderToken();
            expect(result.token).toBe('recaptcha-app-check-token');
            expect(turnstileExecute).toHaveBeenCalledTimes(1);
            expect(exchangeTurnstileTokenActionMock).not.toHaveBeenCalled();
        });

        it('resets a timed-out Turnstile widget before running the fallback', async () => {
            installTurnstile();
            turnstileExecute.mockImplementationOnce(() => {});
            const order: string[] = [];
            turnstileReset.mockImplementation(() => { order.push('reset'); });
            vi.stubGlobal('fetch', vi.fn(() => {
                order.push('fallback');
                return Promise.resolve({
                    status: 200,
                    json: () => Promise.resolve({ token: 'recaptcha-app-check-token', ttl: '3600s' }),
                });
            }));

            vi.useFakeTimers();
            const { getAppCheckToken, APP_CHECK_CHALLENGE_TIMEOUT_MS } = await import('./firebase_client.js');
            void getAppCheckToken();
            await vi.advanceTimersByTimeAsync(0);
            const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<{ token: string }> };
            const pending = options.getToken();
            await vi.advanceTimersByTimeAsync(APP_CHECK_CHALLENGE_TIMEOUT_MS);
            await expect(pending).resolves.toMatchObject({ token: 'recaptcha-app-check-token' });
            expect(order[0]).toBe('reset');
            expect(order).toContain('fallback');
            vi.useRealTimers();
        });

        it('skips the fallback when recaptchaFallback is false', async () => {
            vi.doMock('@intl-config', () => ({
                default: {
                    firebaseAuth: {
                        ...baseConfig.firebaseAuth,
                        appCheck: { turnstileSiteKey: 'cf-site-key', recaptchaV3SiteKey: 'site-key', recaptchaFallback: false },
                    },
                },
            }));
            installTurnstile({ fail: true });
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);

            await expect(getTurnstileProviderToken()).rejects.toThrow(/Turnstile error/);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects with the Turnstile error when the fallback fails too', async () => {
            installTurnstile({ fail: true });
            vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ status: 403, json: () => Promise.resolve({}) })));

            await expect(getTurnstileProviderToken()).rejects.toThrow(/Turnstile error/);
        });
    });

    it('reuses a just-failed challenge instead of showing a second one', async () => {
        installTurnstile({ fail: true });
        vi.useFakeTimers();

        const { getAppCheckToken, TURNSTILE_FAILURE_REUSE_MS } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };

        await expect(options.getToken()).rejects.toThrow(/Turnstile error/);
        await expect(options.getToken()).rejects.toThrow(/Turnstile error/);
        expect(turnstileExecute).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(TURNSTILE_FAILURE_REUSE_MS);
        await expect(options.getToken()).rejects.toThrow(/Turnstile error/);
        expect(turnstileExecute).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('rejects immediately when the Turnstile script fails to load', async () => {
        const selector = 'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]';
        vi.useFakeTimers();

        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/never loaded/);

        document.head.querySelector(selector)?.dispatchEvent(new Event('error'));
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
        vi.useRealTimers();
    });

    it('rejects after APP_CHECK_CHALLENGE_TIMEOUT_MS when execute never calls back', async () => {
        installTurnstile();
        turnstileExecute.mockImplementationOnce(() => {});
        vi.useFakeTimers();

        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/timed out/);

        await vi.advanceTimersByTimeAsync((await import('./firebase_client.js')).APP_CHECK_CHALLENGE_TIMEOUT_MS);
        await assertion;
        vi.useRealTimers();
    });

    it('shows the widget while a managed challenge needs interaction and outlasts the regular timeouts', async () => {
        let params: {
            callback?: (t: string) => void;
            'before-interactive-callback'?: () => void;
            'after-interactive-callback'?: () => void;
        } = {};
        installTurnstile();
        turnstileRender.mockImplementation((_container: HTMLElement, p: typeof params) => {
            params = p;
            return 'turnstile-widget-id';
        });
        turnstileExecute.mockImplementation(() => params['before-interactive-callback']?.());
        exchangeTurnstileTokenActionMock.mockResolvedValueOnce({
            status: 'ok',
            token: 'minted-app-check-token',
            expireTimeMillis: 1800000000000,
        });
        vi.useFakeTimers();

        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as {
            getToken: () => Promise<{ token: string; expireTimeMillis: number }>;
        };
        const pending = options.getToken();
        await vi.advanceTimersByTimeAsync(0);

        const container = document.getElementById('fire_app_check_turnstile')!;
        expect(container.style.display).toBe('flex');
        expect(container.style.position).toBe('fixed');

        await vi.advanceTimersByTimeAsync(30_000);
        params['after-interactive-callback']?.();
        params.callback?.('turnstile-token');

        await expect(pending).resolves.toEqual({
            token: 'minted-app-check-token',
            expireTimeMillis: 1800000000000,
        });
        expect(container.style.display).toBe('block');
        vi.useRealTimers();
    });

    it('rejects and hides the widget when an interactive challenge exceeds TURNSTILE_INTERACTIVE_TIMEOUT_MS', async () => {
        let params: { 'before-interactive-callback'?: () => void } = {};
        installTurnstile();
        turnstileRender.mockImplementation((_container: HTMLElement, p: typeof params) => {
            params = p;
            return 'turnstile-widget-id';
        });
        turnstileExecute.mockImplementation(() => params['before-interactive-callback']?.());
        vi.useFakeTimers();

        const { getAppCheckToken, TURNSTILE_INTERACTIVE_TIMEOUT_MS } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.advanceTimersByTimeAsync(0);
        const options = CustomProvider.mock.calls[0]![0] as { getToken: () => Promise<unknown> };
        const pending = options.getToken();
        const assertion = expect(pending).rejects.toThrow(/timed out/);

        await vi.advanceTimersByTimeAsync((await import('./firebase_client.js')).APP_CHECK_CHALLENGE_TIMEOUT_MS + TURNSTILE_INTERACTIVE_TIMEOUT_MS);
        await assertion;
        expect(document.getElementById('fire_app_check_turnstile')!.style.display).toBe('block');
        expect(turnstileReset).toHaveBeenCalledWith('turnstile-widget-id');
        vi.useRealTimers();
    });

    it('prefers Turnstile over reCAPTCHA when both site keys are set', async () => {
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: {
                        turnstileSiteKey: 'cf-site-key',
                        recaptchaV3SiteKey: 'rc-site-key',
                        recaptchaEnterpriseSiteKey: 'rc-enterprise-key',
                    },
                },
            },
        }));

        const { getAppCheckToken } = await import('./firebase_client.js');
        await getAppCheckToken();
        expect(CustomProvider).toHaveBeenCalledWith(expect.objectContaining({ getToken: expect.any(Function) }));
        expect(ReCaptchaV3Provider).not.toHaveBeenCalled();
        expect(ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    });

    it('preloads Turnstile script by default', async () => {
        vi.resetModules();
        delete (window as { turnstile?: unknown }).turnstile;
        turnstileRender?.mockClear();
        vi.doMock('@intl-config', () => turnstileConfig);
        const selector = 'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]';
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
        await vi.waitFor(() => expect(document.querySelectorAll(selector)).toHaveLength(1));
        installTurnstile();
    });

    it('does not preload Turnstile script when preloadTurnstile is false', async () => {
        vi.resetModules();
        delete (window as { turnstile?: unknown }).turnstile;
        turnstileRender?.mockClear();
        vi.doMock('@intl-config', () => ({
            default: {
                firebaseAuth: {
                    ...baseConfig.firebaseAuth,
                    appCheck: {
                        turnstileSiteKey: 'cf-site-key',
                        preloadTurnstile: false,
                    },
                },
            },
        }));
        const selector = 'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]';
        const { getAppCheckToken } = await import('./firebase_client.js');
        void getAppCheckToken();
        await vi.waitFor(() => expect(CustomProvider).toHaveBeenCalled());
        expect(document.querySelectorAll(selector)).toHaveLength(0);
    });
});
