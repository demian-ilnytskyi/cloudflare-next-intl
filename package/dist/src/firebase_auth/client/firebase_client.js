'use client';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
let cachedAppCheck;
let cachedPerformance;
const GRECAPTCHA_LOAD_TIMEOUT_MS = 15000;
const GRECAPTCHA_POLL_INTERVAL_MS = 50;
function waitForGrecaptcha() {
    if (window.grecaptcha)
        return Promise.resolve(window.grecaptcha);
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (window.grecaptcha) {
                clearInterval(timer);
                resolve(window.grecaptcha);
            }
            else if (Date.now() - startedAt >= GRECAPTCHA_LOAD_TIMEOUT_MS) {
                clearInterval(timer);
                reject(new Error('window.grecaptcha never loaded; ensure the reCAPTCHA <script src="https://www.google.com/recaptcha/api.js?render=explicit"> tag is present'));
            }
        }, GRECAPTCHA_POLL_INTERVAL_MS);
    });
}
function createExplicitRecaptchaProvider(app, siteKey, CustomProviderCtor) {
    let widgetReady;
    let widgetSucceeded = false;
    function ensureWidget() {
        if (widgetReady)
            return widgetReady;
        const pending = (async () => {
            const grecaptcha = await waitForGrecaptcha();
            return new Promise(resolve => {
                grecaptcha.ready(() => {
                    const containerId = `fire_app_check_${app.name}`;
                    let container = document.getElementById(containerId);
                    if (!container) {
                        container = document.createElement('div');
                        container.id = containerId;
                        container.style.display = 'none';
                        document.body.appendChild(container);
                    }
                    resolve({
                        grecaptcha,
                        widgetId: grecaptcha.render(container, {
                            sitekey: siteKey,
                            size: 'invisible',
                            callback: () => {
                                widgetSucceeded = true;
                            },
                            'error-callback': () => {
                                widgetSucceeded = false;
                            },
                        }),
                    });
                });
            });
        })();
        widgetReady = pending.catch(error => {
            widgetReady = undefined;
            throw error;
        });
        return widgetReady;
    }
    return new CustomProviderCtor({
        getToken: async () => {
            const { grecaptcha, widgetId } = await ensureWidget();
            const recaptchaToken = await grecaptcha
                .execute(widgetId, { action: 'fire_app_check' })
                .catch(() => {
                throw new Error('reCAPTCHA error');
            });
            if (!widgetSucceeded) {
                throw new Error('reCAPTCHA error');
            }
            const { projectId, appId, apiKey } = app.options;
            const response = await fetch(`https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeRecaptchaV3Token?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recaptcha_v3_token: recaptchaToken }),
            });
            if (response.status !== 200) {
                throw new Error(`App Check token exchange failed with status ${response.status}`);
            }
            const body = (await response.json());
            const match = body.ttl.match(/^([\d.]+)s$/);
            if (!match) {
                throw new Error(`Unexpected ttl format in App Check exchange response: ${body.ttl}`);
            }
            return { token: body.token, expireTimeMillis: Date.now() + Number(match[1]) * 1000 };
        },
    });
}
async function initializeFirebaseAppCheck(app, appCheckConfig) {
    const { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider, CustomProvider } = await import('@firebase/app-check');
    if (appCheckConfig.debugToken) {
        globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
            appCheckConfig.debugToken;
    }
    const provider = appCheckConfig.recaptchaEnterpriseSiteKey
        ? new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaEnterpriseSiteKey)
        : appCheckConfig.useExplicitRecaptchaScript !== false
            ? createExplicitRecaptchaProvider(app, appCheckConfig.recaptchaV3SiteKey, CustomProvider)
            : new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey);
    return initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: appCheckConfig.isTokenAutoRefreshEnabled ?? true,
    });
}
const APP_CHECK_TOKEN_TIMEOUT_MS = 10000;
export async function getAppCheckToken() {
    if (!cachedAppCheck)
        return undefined;
    const { getToken } = await import('@firebase/app-check');
    try {
        const result = await Promise.race([
            getToken(cachedAppCheck),
            new Promise((_, reject) => setTimeout(() => reject(new Error('App Check token timed out')), APP_CHECK_TOKEN_TIMEOUT_MS)),
        ]);
        return result.token;
    }
    catch (error) {
        console.warn('App Check token fetch failed, continuing without it', error);
        return undefined;
    }
}
let cached;
let cachedPromise;
export async function getFirebaseAuthClient() {
    requireFirebaseAuthConfig(config.firebaseAuth);
    if (cached)
        return cached;
    if (!cachedPromise) {
        const fa = config.firebaseAuth;
        const isPerformanceEnabled = fa.performance !== false && typeof window !== 'undefined';
        cachedPromise = Promise.all([
            import('@firebase/app'),
            import('@firebase/auth'),
            isPerformanceEnabled ? import('@firebase/performance') : Promise.resolve(null),
        ]).then(async ([{ getApp, getApps, initializeApp }, { getAuth }, perfModule]) => {
            const firebaseConfig = {
                apiKey: fa.apiKey,
                authDomain: fa.authDomain,
                projectId: fa.projectId,
                storageBucket: fa.storageBucket,
                messagingSenderId: fa.messagingSenderId,
                appId: fa.appId,
                measurementId: fa.measurementId,
            };
            const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
            if (fa.appCheck && typeof window !== 'undefined') {
                try {
                    cachedAppCheck = await initializeFirebaseAppCheck(app, fa.appCheck);
                }
                catch (error) {
                    console.warn('App Check initialization failed, continuing without it', error);
                }
            }
            if (perfModule) {
                cachedPerformance = perfModule.getPerformance(app);
            }
            const auth = getAuth(app);
            cached = { app, auth };
            return cached;
        });
    }
    return cachedPromise;
}
export function getFirebaseAuthClientSync() {
    return cached;
}
export function getFirebasePerformanceSync() {
    return cachedPerformance;
}
let cachedAuthModule;
export function getFirebaseAuthModule() {
    if (!cachedAuthModule) {
        cachedAuthModule = import('@firebase/auth');
    }
    return cachedAuthModule;
}
