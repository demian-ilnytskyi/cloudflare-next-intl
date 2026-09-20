'use client';

import type { FirebaseApp } from '@firebase/app';
import type { Auth } from '@firebase/auth';
import type { AppCheck, CustomProvider } from '@firebase/app-check';
import type * as FirebaseAuthModule from '@firebase/auth';
import type { FirebasePerformance } from '@firebase/performance';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import type { FirebaseAppCheckConfig } from '../../types/types.js';

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

const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';

/**
 * Appends the `render=explicit` reCAPTCHA script on first actual need.
 * `IntlHelperScript` used to render it into `<head>` on every page, which cost
 * every anonymous visitor ~345KB of gstatic JavaScript on pages that never
 * mint an App Check token; injecting it here keeps the same explicit-render
 * flow while moving the cost to the first `getToken()`.
 */
let recaptchaScriptFailed = false;

function ensureRecaptchaScript(): void {
    if (window.grecaptcha) return;
    if (document.querySelector(`script[src="${RECAPTCHA_SCRIPT_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = RECAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    // Without this a blocked or 404'd script costs the caller the full
    // 15s poll timeout before it gives up.
    script.onerror = () => { recaptchaScriptFailed = true; };
    document.head.appendChild(script);
}

/**
 * Resolves once the reCAPTCHA script has defined `window.grecaptcha`. The
 * script tag `IntlHelperScript` renders is `async`, and
 * `initializeAppCheck` fetches a token immediately when
 * `isTokenAutoRefreshEnabled` is on, so the first `getToken` regularly runs
 * before the script has landed — this polls instead of failing outright.
 */
function waitForGrecaptcha(): Promise<Grecaptcha> {
    if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
    ensureRecaptchaScript();
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (window.grecaptcha) {
                clearInterval(timer);
                resolve(window.grecaptcha);
            } else if (recaptchaScriptFailed || Date.now() - startedAt >= GRECAPTCHA_LOAD_TIMEOUT_MS) {
                clearInterval(timer);
                reject(
                    new Error(
                        `window.grecaptcha never loaded; ${RECAPTCHA_SCRIPT_SRC} failed to load or was blocked`,
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
    CustomProviderCtor: typeof CustomProvider,
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

    return new CustomProviderCtor({
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
        '@firebase/app-check'
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

let appCheckInitPromise: Promise<void> | undefined;

/**
 * Initializes App Check at most once. `getFirebaseAuthClient()` awaits this
 * eagerly by default, because `@firebase/auth` reads the App Check provider
 * off the app per-request (`getImmediate({ optional: true })`) and simply
 * omits the `X-Firebase-AppCheck` header when it isn't registered yet — so
 * anything that initializes it later leaves every earlier request, sign-in
 * included, unprotected. `appCheck.lazyInit` opts out of that for apps
 * without App Check enforcement, deferring the cost to the first
 * `getAppCheckToken()`.
 *
 * The promise is assigned before the first `await` so concurrent callers
 * share one initialization; a second `initializeAppCheck` with a different
 * provider instance throws `already-initialized`.
 */
function initAppCheckOnce(app: FirebaseApp): Promise<void> {
    if (appCheckInitPromise) return appCheckInitPromise;
    const appCheckConfig = config.firebaseAuth?.appCheck;
    if (!appCheckConfig || typeof window === 'undefined') return Promise.resolve();
    appCheckInitPromise = (async () => {
        try {
            cachedAppCheck = await initializeFirebaseAppCheck(app, appCheckConfig);
        } catch (error) {
            console.warn('App Check initialization failed, continuing without it', error);
        }
    })();
    return appCheckInitPromise;
}

async function ensureAppCheck(): Promise<void> {
    if (appCheckInitPromise) return appCheckInitPromise;
    const appCheckConfig = config.firebaseAuth?.appCheck;
    if (!appCheckConfig || typeof window === 'undefined') return;
    // Resolves the app without recursing: on the eager path this call has
    // already run `initAppCheckOnce` itself, so the next line is a no-op.
    const { app } = await getFirebaseAuthClient();
    return initAppCheckOnce(app);
}

export async function getAppCheckToken(): Promise<string | undefined> {
    // Best-effort by contract: a firebase chunk that 404s on a stale deploy
    // must not turn this into a rejection its callers never handled before.
    await ensureAppCheck().catch(() => undefined);
    if (!cachedAppCheck) return undefined;
    const { getToken } = await import('@firebase/app-check');
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
 *
 * `getApps().length ? getApp() : initializeApp(...)` below only reuses the
 * consumer's own Firebase app if `@firebase/app` resolves to the SAME module
 * instance the consumer's `initializeApp()` call ran against — `_apps` is
 * module-level state inside `@firebase/app`, not a global. That's why
 * `@firebase/app`/`@firebase/auth`/`@firebase/app-check`/`@firebase/performance`
 * are declared as `peerDependencies` (see package.json), never as regular
 * `dependencies`: a bundled copy resolved independently of the consumer's own
 * `firebase` install would silently `initializeApp()` a second, untracked app
 * here instead of joining theirs, and auth state would stop being shared.
 */
export async function getFirebaseAuthClient(): Promise<{ app: FirebaseApp; auth: Auth }> {
    requireFirebaseAuthConfig(config.firebaseAuth);
    if (cached) return cached;
    if (!cachedPromise) {
        const fa = config.firebaseAuth;
        const isPerformanceEnabled = fa.performance !== false && typeof window !== 'undefined';
        cachedPromise = Promise.all([
            import('@firebase/app'),
            import('@firebase/auth'),
            isPerformanceEnabled ? import('@firebase/performance') : Promise.resolve(null),
        ]).then(
            async ([{ getApp, getApps, initializeApp }, authModule, perfModule]) => {
                const { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence } = authModule;
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
                // Before `auth` is constructed, so every request it makes
                // carries `X-Firebase-AppCheck` — `@firebase/auth` reads the
                // provider per-request and silently omits the header when it
                // isn't registered yet. See `ensureAppCheck`.
                if (!fa.appCheck?.lazyInit) await initAppCheckOnce(app);
                if (perfModule) {
                    // `instrumentationEnabled: false`: Firebase's own automatic
                    // instrumentation runs a SECOND, independent set of web-vitals
                    // PerformanceObservers for its automatic page-load trace, racing
                    // the ones `AutoFirebasePerformanceEvents` already registers via
                    // `useReportWebVitals` below. Two observers over the same
                    // LCP/CLS/INP entries can leave one of them reading a
                    // just-cleared entry, throwing inside web-vitals' own internals
                    // ("Cannot read properties of undefined (reading 'startTime')").
                    // We already report the same metrics ourselves, so disabling
                    // Firebase's redundant copy removes the race instead of only
                    // hiding its symptom. Trade-off: this also turns off Firebase's
                    // automatic network-request traces (bundled under the same
                    // flag) — add those manually via `trace()` if needed.
                    cachedPerformance = perfModule.initializePerformance(app, { instrumentationEnabled: false });
                }
                // `getAuth(app)` wires up `browserPopupRedirectResolver`, which
                // proactively opens the `__/auth/iframe.js` relay iframe on
                // mobile/Safari/iOS user agents regardless of persistence —
                // see `skipPopupRedirectResolver`'s doc comment. Matching
                // `getAuth`'s own persistence fallback chain here (just without
                // the resolver) keeps behavior otherwise identical. Falls back
                // to `getAuth` when the consumer already initialized auth on
                // this app, where `initializeAuth` throws `already-initialized`
                // — and `cachedPromise` would memoize that rejection forever.
                let auth: Auth;
                if (fa.skipPopupRedirectResolver) {
                    try {
                        auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
                    } catch {
                        auth = getAuth(app);
                    }
                } else {
                    auth = getAuth(app);
                }
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

let cachedAuthModule: Promise<typeof FirebaseAuthModule> | undefined;

/** Memoized `import('@firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export function getFirebaseAuthModule(): Promise<typeof FirebaseAuthModule> {
    if (!cachedAuthModule) {
        cachedAuthModule = import('@firebase/auth');
    }
    return cachedAuthModule;
}
