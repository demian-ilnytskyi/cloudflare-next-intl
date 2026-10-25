'use client';

import type { FirebaseApp } from '@firebase/app';
import type { Auth } from '@firebase/auth';
import type { AppCheck, CustomProvider } from '@firebase/app-check';
import type * as FirebaseAuthModule from '@firebase/auth';
import type { FirebasePerformance } from '@firebase/performance';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import type { FirebaseAppCheckConfig } from '../../types.js';
import { defaultAppCheckTokenCookieName } from '../cookie_names.js';
import { isAppCheckTokenUsable } from '../app_check_token.js';
import getCookie from 'cloudflare-next-intl-intl/getCookie';
import decodeJwtPayload from '../decode_jwt_payload.js';
import exchangeTurnstileTokenAction from '../server/exchange_turnstile_token_action.js';

export const APP_CHECK_CHALLENGE_TIMEOUT_MS = 30_000;
export const RECAPTCHA_TOKEN_TIMEOUT_MS = APP_CHECK_CHALLENGE_TIMEOUT_MS;

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

interface Turnstile {
    render: (
        container: HTMLElement | string,
        params: {
            sitekey: string;
            action?: string;
            appearance?: 'always' | 'execute' | 'interaction-only';
            execution?: 'render' | 'execute';
            retry?: 'auto' | 'never';
            callback?: (token: string) => void;
            'error-callback'?: (error?: unknown) => void;
            'timeout-callback'?: () => void;
            'before-interactive-callback'?: () => void;
            'after-interactive-callback'?: () => void;
        },
    ) => string;
    execute: (container?: HTMLElement | string, params?: { action?: string }) => void;
    reset: (widgetId: string) => void;
}

declare global {
    interface Window {
        grecaptcha?: Grecaptcha;
        turnstile?: Turnstile;
    }
}

const TURNSTILE_LOAD_TIMEOUT_MS = 15_000;
const TURNSTILE_POLL_INTERVAL_MS = 50;
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptFailed = false;

/**
 * Managed widgets may ask a risky visitor to click a checkbox. While that
 * challenge is on screen, the regular challenge/token timeouts would abort a
 * visitor mid-click, so each timeout is extended once by this amount.
 */
export const TURNSTILE_INTERACTIVE_TIMEOUT_MS = 120_000;

/**
 * A failed challenge is rethrown to `getToken` calls made within this window,
 * so the Firebase request right after a failed `getAppCheckToken()` fails fast
 * instead of showing the visitor a second challenge.
 */
export const TURNSTILE_FAILURE_REUSE_MS = 3_000;

let turnstileInteractive = false;

function interactionAwareTimeout(ms: number, message: string): { promise: Promise<never>; clear: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<never>((_, reject) => {
        const arm = (delay: number, extended: boolean) => {
            timer = setTimeout(() => {
                if (turnstileInteractive && !extended) arm(TURNSTILE_INTERACTIVE_TIMEOUT_MS, true);
                else reject(new Error(message));
            }, delay);
        };
        arm(ms, false);
    });
    return { promise, clear: () => clearTimeout(timer) };
}

// Never `display: none`: Turnstile's managed mode needs the iframe rendered to
// collect the signals that let it pass a visitor invisibly — a non-rendered
// iframe pushes it into the interactive checkbox. `appearance:
// 'interaction-only'` already keeps the widget invisible until it needs input.
const TURNSTILE_IDLE_STYLE = {
    display: 'block',
    position: 'fixed',
    inset: 'auto 0 0 auto',
    alignItems: '',
    justifyContent: '',
    background: 'transparent',
    zIndex: '',
};

function setTurnstileContainerVisible(container: HTMLElement, visible: boolean): void {
    turnstileInteractive = visible;
    Object.assign(container.style, visible
        ? {
            display: 'flex',
            position: 'fixed',
            inset: '0',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: '2147483647',
        }
        : TURNSTILE_IDLE_STYLE);
}

function ensureTurnstileScript(): void {
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        turnstileScriptFailed = true;
    };
    document.head.appendChild(script);
}

function waitForTurnstile(): Promise<Turnstile> {
    if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve(window.turnstile);
    ensureTurnstileScript();
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (typeof window !== 'undefined' && window.turnstile) {
                clearInterval(timer);
                resolve(window.turnstile);
            } else if (turnstileScriptFailed || Date.now() - startedAt >= TURNSTILE_LOAD_TIMEOUT_MS) {
                clearInterval(timer);
                reject(
                    new Error(
                        `window.turnstile never loaded; ${TURNSTILE_SCRIPT_SRC} failed to load or was blocked`,
                    ),
                );
            }
        }, TURNSTILE_POLL_INTERVAL_MS);
    });
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
    if (typeof window !== 'undefined' && window.grecaptcha) return Promise.resolve(window.grecaptcha);
    ensureRecaptchaScript();
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (typeof window !== 'undefined' && window.grecaptcha) {
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

function readSeededAppCheckToken(): { token: string; expireTimeMillis: number } | null {
    const fa = config.firebaseAuth;
    const cookieName = fa?.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const seededToken = getCookie(cookieName);
    if (isAppCheckTokenUsable(seededToken)) {
        const decoded = decodeJwtPayload(seededToken!);
        if (decoded?.exp) {
            return { token: seededToken!, expireTimeMillis: decoded.exp * 1000 };
        }
    }
    return null;
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
    return new CustomProviderCtor({ getToken: createExplicitRecaptchaTokenGetter(app, siteKey) });
}

function createExplicitRecaptchaTokenGetter(
    app: FirebaseApp,
    siteKey: string,
): () => Promise<{ token: string; expireTimeMillis: number }> {
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

    return async () => {
            const seeded = readSeededAppCheckToken();
            if (seeded) return seeded;

            const { grecaptcha, widgetId } = await ensureWidget();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('reCAPTCHA timed out')), RECAPTCHA_TOKEN_TIMEOUT_MS);
            });
            const executePromise = grecaptcha
                .execute(widgetId, { action: 'fire_app_check' })
                .catch(() => {
                    throw new Error('reCAPTCHA error');
                });
            let recaptchaToken: string;
            try {
                recaptchaToken = await Promise.race([executePromise, timeoutPromise]);
            } finally {
                if (timer) clearTimeout(timer);
            }
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
    };
}

function createTurnstileProvider(
    siteKey: string,
    CustomProviderCtor: typeof CustomProvider,
    fallbackGetToken?: () => Promise<{ token: string; expireTimeMillis: number }>,
    preload: boolean = true,
) {
    let widgetReady: Promise<{
        executeChallenge: () => Promise<string>;
        resetWidget: () => void;
    }> | undefined;
    let inFlightExecute: Promise<{ token: string; expireTimeMillis: number }> | undefined;
    let recentFailure: { error: unknown; at: number } | undefined;

    function ensureWidget(): Promise<{
        executeChallenge: () => Promise<string>;
        resetWidget: () => void;
    }> {
        if (widgetReady) return widgetReady;
        const pending = (async () => {
            const turnstile = await waitForTurnstile();
            const containerId = 'fire_app_check_turnstile';
            let container = document.getElementById(containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = containerId;
                Object.assign(container.style, TURNSTILE_IDLE_STYLE);
                document.body.appendChild(container);
            }
            const widgetContainer = container;
            let activeResolve: ((token: string) => void) | undefined;
            let activeReject: ((err: Error) => void) | undefined;

            const widgetId = turnstile.render(container, {
                sitekey: siteKey,
                appearance: 'interaction-only',
                execution: 'execute',
                retry: 'never',
                action: 'fire_app_check',
                callback: (token: string) => {
                    activeResolve?.(token);
                },
                'error-callback': () => {
                    activeReject?.(new Error('Turnstile error'));
                },
                'timeout-callback': () => {
                    activeReject?.(new Error('Turnstile timed out'));
                },
                'before-interactive-callback': () => setTurnstileContainerVisible(widgetContainer, true),
                'after-interactive-callback': () => setTurnstileContainerVisible(widgetContainer, false),
            });

            const executeChallenge = (): Promise<string> => {
                return new Promise<string>((resolve, reject) => {
                    activeResolve = resolve;
                    activeReject = reject;
                    try {
                        turnstile.execute(widgetId);
                    } catch (err) {
                        reject(err instanceof Error ? err : new Error('Turnstile execute failed'));
                    }
                });
            };

            const resetWidget = () => {
                setTurnstileContainerVisible(widgetContainer, false);
                turnstile.reset(widgetId);
            };

            return { executeChallenge, resetWidget };
        })();

        widgetReady = pending.catch(error => {
            widgetReady = undefined;
            throw error;
        });
        return widgetReady;
    }

    if (preload && typeof window !== 'undefined') {
        const seeded = readSeededAppCheckToken();
        if (!seeded) {
            void ensureWidget().catch(() => undefined);
        }
    }

    return new CustomProviderCtor({
        getToken: async () => {
            const seeded = readSeededAppCheckToken();
            if (seeded) return seeded;

            if (inFlightExecute) return inFlightExecute;
            if (recentFailure && Date.now() - recentFailure.at < TURNSTILE_FAILURE_REUSE_MS) throw recentFailure.error;

            inFlightExecute = (async () => {
                const timeout = interactionAwareTimeout(APP_CHECK_CHALLENGE_TIMEOUT_MS, 'Turnstile timed out');
                let resetActiveWidget: (() => void) | undefined;
                let cancelled = false;

                const executeFlow = (async () => {
                    const { executeChallenge, resetWidget } = await ensureWidget();
                    resetActiveWidget = resetWidget;
                    const turnstileToken = await executeChallenge();
                    if (cancelled) return new Promise<never>(() => {});
                    const result = await exchangeTurnstileTokenAction(turnstileToken);
                    if (cancelled) return new Promise<never>(() => {});
                    if (result.status !== 'ok') {
                        throw new Error(`Turnstile exchange rejected with status: ${result.status}`);
                    }
                    resetActiveWidget = undefined;
                    resetWidget();
                    return {
                        token: result.token,
                        expireTimeMillis: result.expireTimeMillis,
                    };
                })();

                try {
                    return await Promise.race([executeFlow, timeout.promise]);
                } catch (error) {
                    cancelled = true;
                    resetActiveWidget?.();
                    resetActiveWidget = undefined;
                    if (!fallbackGetToken) throw error;
                    return await fallbackGetToken().catch(() => {
                        throw error;
                    });
                } finally {
                    timeout.clear();
                }
            })().then(result => {
                recentFailure = undefined;
                return result;
            }, (error: unknown) => {
                recentFailure = { error, at: Date.now() };
                throw error;
            }).finally(() => {
                inFlightExecute = undefined;
            });

            return inFlightExecute;
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
    const provider = appCheckConfig.turnstileSiteKey
        ? createTurnstileProvider(
            appCheckConfig.turnstileSiteKey,
            CustomProvider,
            appCheckConfig.recaptchaV3SiteKey && appCheckConfig.recaptchaFallback !== false
                ? createExplicitRecaptchaTokenGetter(app, appCheckConfig.recaptchaV3SiteKey)
                : undefined,
            appCheckConfig.preloadTurnstile !== false,
        )
        : appCheckConfig.recaptchaEnterpriseSiteKey
          ? new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaEnterpriseSiteKey)
          : appCheckConfig.useExplicitRecaptchaScript !== false
            ? createExplicitRecaptchaProvider(app, appCheckConfig.recaptchaV3SiteKey as string, CustomProvider)
            : new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey as string);
    return initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: appCheckConfig.isTokenAutoRefreshEnabled ?? false,
    });
}

/**
 * Current App Check token, or `undefined` if `appCheck` isn't configured or
 * hasn't initialized yet. Forces a refresh only when the cached token is
 * expired/near-expiry — mirrors `getToken`'s own semantics, just exposed
 * here so callers (e.g. `AuthUserProvider`'s session-cookie sync) don't need
 * to import `firebase/app-check` themselves.
 */
const APP_CHECK_TOKEN_TIMEOUT_MS = APP_CHECK_CHALLENGE_TIMEOUT_MS;

/**
 * Timeout for the `getAppCheckToken()` call the auth actions make before a
 * Firebase request. It outlasts a slow, non-interactive challenge plus the
 * reCAPTCHA fallback, so the token is ready before Firebase's own 30 s
 * request timeout starts.
 */
export const APP_CHECK_ACTION_TIMEOUT_MS = 90_000;

let appCheckInitPromise: Promise<void> | undefined;

/**
 * Initializes App Check at most once, from `getFirebaseAuthClient()` or
 * `getAppCheckToken()`, whichever runs first.
 *
 * The promise is assigned before the first `await` so concurrent callers
 * share one initialization; a second `initializeAppCheck` with a different
 * provider instance throws `already-initialized`.
 */
function initAppCheckFor(app: FirebaseApp): Promise<void> | undefined {
    const appCheckConfig = config.firebaseAuth?.appCheck;
    if (!appCheckConfig || typeof window === 'undefined') return undefined;
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
    await getFirebaseAuthClient();
}

export async function getAppCheckToken(timeoutMs: number = APP_CHECK_TOKEN_TIMEOUT_MS): Promise<string | undefined> {
    // Best-effort by contract: a firebase chunk that 404s on a stale deploy
    // must not turn this into a rejection its callers never handled before.
    await ensureAppCheck().catch(() => undefined);
    if (!cachedAppCheck) return undefined;
    const { getToken } = await import('@firebase/app-check');
    try {
        const timeout = interactionAwareTimeout(timeoutMs, 'App Check token timed out');
        try {
            const result = await Promise.race([getToken(cachedAppCheck), timeout.promise]);
            return result.token;
        } finally {
            timeout.clear();
        }
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
                // Before `getAuth`: it restores the persisted user with an
                // `accounts:lookup` call, which 401s under App Check
                // enforcement if App Check isn't registered on the app yet.
                await initAppCheckFor(app);
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

export { ensureSessionSynced } from './session_sync.js';
