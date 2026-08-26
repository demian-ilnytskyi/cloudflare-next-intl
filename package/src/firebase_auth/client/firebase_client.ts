'use client';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { AppCheck } from 'firebase/app-check';
import type { FirebasePerformance } from 'firebase/performance';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import type { FirebaseAppCheckConfig } from '../../types/types';

let cachedAppCheck: AppCheck | undefined;
let cachedPerformance: FirebasePerformance | undefined;

interface Grecaptcha {
    ready: (callback: () => void) => void;
    render: (
        container: HTMLElement,
        params: {
            sitekey: string;
            size: 'invisible';
            callback: () => void;
            'error-callback': () => void;
        },
    ) => string;
    execute: (widgetId: string, options: { action: string }) => Promise<string>;
}

declare global {
    interface Window {
        grecaptcha?: Grecaptcha;
    }
}

const GRECAPTCHA_LOAD_TIMEOUT_MS = 15_000;
const GRECAPTCHA_POLL_INTERVAL_MS = 50;

/**
 * Resolves once the reCAPTCHA script has defined `window.grecaptcha`. The
 * script tag `IntlHelperScript` renders is `async`, and
 * `initializeAppCheck` fetches a token immediately when
 * `isTokenAutoRefreshEnabled` is on, so the first `getToken` regularly runs
 * before the script has landed — this polls instead of failing outright.
 */
function waitForGrecaptcha(): Promise<Grecaptcha> {
    if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (window.grecaptcha) {
                clearInterval(timer);
                resolve(window.grecaptcha);
            } else if (Date.now() - startedAt >= GRECAPTCHA_LOAD_TIMEOUT_MS) {
                clearInterval(timer);
                reject(
                    new Error(
                        'window.grecaptcha never loaded; ensure the reCAPTCHA <script src="https://www.google.com/recaptcha/api.js?render=explicit"> tag is present',
                    ),
                );
            }
        }, GRECAPTCHA_POLL_INTERVAL_MS);
    });
}

/**
 * Faithful reimplementation of `ReCaptchaV3Provider`'s internal
 * widget-render + token-exchange flow (see `@firebase/app-check`'s
 * `initializeV3`/`queueWidgetRender`/`getToken$1`/`exchangeToken`), minus
 * its own internal `<script>` injection — that injection is what spawns the
 * worker documented on `useExplicitRecaptchaScript`. Relies on the script
 * tag `IntlHelperScript` renders, waiting for it rather than assuming it has
 * already loaded. Hits the same public `exchangeRecaptchaV3Token` REST
 * endpoint Firebase's own provider uses, so this stays correct even if
 * `@firebase/app-check` changes its internal script-loading strategy.
 */
function createExplicitRecaptchaProvider(
    app: FirebaseApp,
    siteKey: string,
    CustomProvider: typeof import('firebase/app-check').CustomProvider,
) {
    let widgetReady: Promise<{ grecaptcha: Grecaptcha; widgetId: string }> | undefined;
    let widgetSucceeded = false;

    function ensureWidget(): Promise<{ grecaptcha: Grecaptcha; widgetId: string }> {
        if (widgetReady) return widgetReady;
        const pending = (async () => {
            const grecaptcha = await waitForGrecaptcha();
            return new Promise<{ grecaptcha: Grecaptcha; widgetId: string }>(resolve => {
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
        // Never memoize a rejection: a failed load (script still in flight,
        // transient network error) must not permanently disable App Check for
        // the rest of the page's lifetime.
        widgetReady = pending.catch(error => {
            widgetReady = undefined;
            throw error;
        });
        return widgetReady;
    }

    return new CustomProvider({
        getToken: async () => {
            const { grecaptcha, widgetId } = await ensureWidget();
            // `grecaptcha.execute()` rejects with `null` on failure, which
            // surfaces as an unhelpful error — mirror Firebase's own remap.
            const recaptchaToken = await grecaptcha
                .execute(widgetId, { action: 'fire_app_check' })
                .catch(() => {
                    throw new Error('reCAPTCHA error');
                });
            if (!widgetSucceeded) {
                throw new Error('reCAPTCHA error');
            }
            const { projectId, appId, apiKey } = app.options;
            const response = await fetch(
                `https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeRecaptchaV3Token?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recaptcha_v3_token: recaptchaToken }),
                },
            );
            if (response.status !== 200) {
                throw new Error(`App Check token exchange failed with status ${response.status}`);
            }
            const body = (await response.json()) as { token: string; ttl: string };
            const match = body.ttl.match(/^([\d.]+)s$/);
            if (!match) {
                throw new Error(`Unexpected ttl format in App Check exchange response: ${body.ttl}`);
            }
            return { token: body.token, expireTimeMillis: Date.now() + Number(match[1]) * 1000 };
        },
    });
}

async function initializeFirebaseAppCheck(app: FirebaseApp, appCheckConfig: FirebaseAppCheckConfig): Promise<AppCheck> {
    const { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider, CustomProvider } = await import(
        'firebase/app-check'
    );
    if (appCheckConfig.debugToken) {
        (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
            appCheckConfig.debugToken;
    }
    const provider = appCheckConfig.recaptchaEnterpriseSiteKey
        ? new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaEnterpriseSiteKey)
        : appCheckConfig.useExplicitRecaptchaScript !== false
          ? createExplicitRecaptchaProvider(app, appCheckConfig.recaptchaV3SiteKey as string, CustomProvider)
          : new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey as string);
    return initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: appCheckConfig.isTokenAutoRefreshEnabled ?? true,
    });
}

/**
 * Current App Check token, or `undefined` if `appCheck` isn't configured or
 * hasn't initialized yet. Forces a refresh only when the cached token is
 * expired/near-expiry — mirrors `getToken`'s own semantics, just exposed
 * here so callers (e.g. `AuthUserProvider`'s session-cookie sync) don't need
 * to import `firebase/app-check` themselves.
 */
const APP_CHECK_TOKEN_TIMEOUT_MS = 10_000;

export async function getAppCheckToken(): Promise<string | undefined> {
    if (!cachedAppCheck) return undefined;
    const { getToken } = await import('firebase/app-check');
    try {
        const result = await Promise.race([
            getToken(cachedAppCheck),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('App Check token timed out')), APP_CHECK_TOKEN_TIMEOUT_MS),
            ),
        ]);
        return result.token;
    } catch (error) {
        console.warn('App Check token fetch failed, continuing without it', error);
        return undefined;
    }
}

let cached: { app: FirebaseApp; auth: Auth } | undefined;
let cachedPromise: Promise<{ app: FirebaseApp; auth: Auth }> | undefined;

/**
 * Lazily loads and initializes `firebase/app`/`firebase/auth` — a dynamic
 * import, not a static one, so consumers who never call a firebase_auth
 * export never pull these packages into their bundle or runtime at all.
 * Throws if `firebaseAuth` is missing from `RoutingConfig` (see
 * `require_config.ts`) instead of silently no-op'ing.
 */
export async function getFirebaseAuthClient(): Promise<{ app: FirebaseApp; auth: Auth }> {
    requireFirebaseAuthConfig(config.firebaseAuth);
    if (cached) return cached;
    if (!cachedPromise) {
        const fa = config.firebaseAuth;
        const isPerformanceEnabled = fa.performance !== false && typeof window !== 'undefined';
        cachedPromise = Promise.all([
            import('firebase/app'),
            import('firebase/auth'),
            isPerformanceEnabled ? import('firebase/performance') : Promise.resolve(null),
        ]).then(
            async ([{ getApp, getApps, initializeApp }, { getAuth }, perfModule]) => {
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
                    } catch (error) {
                        console.warn('App Check initialization failed, continuing without it', error);
                    }
                }
                if (perfModule) {
                    cachedPerformance = perfModule.getPerformance(app);
                }
                const auth = getAuth(app);
                cached = { app, auth };
                return cached;
            },
        );
    }
    return cachedPromise;
}

/** Synchronous read of the cached client, or `undefined` before the first `getFirebaseAuthClient()` resolves. */
export function getFirebaseAuthClientSync(): { app: FirebaseApp; auth: Auth } | undefined {
    return cached;
}

/** Synchronous read of the cached `FirebasePerformance` instance, or `undefined` if `performance` isn't enabled or hasn't initialized yet. */
export function getFirebasePerformanceSync(): FirebasePerformance | undefined {
    return cachedPerformance;
}

let cachedAuthModule: Promise<typeof import('firebase/auth')> | undefined;

/** Memoized `import('firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export function getFirebaseAuthModule(): Promise<typeof import('firebase/auth')> {
    if (!cachedAuthModule) {
        cachedAuthModule = import('firebase/auth');
    }
    return cachedAuthModule;
}
