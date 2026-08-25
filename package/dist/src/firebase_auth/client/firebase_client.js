'use client';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
let cachedAppCheck;
let cachedPerformance;
async function initializeFirebaseAppCheck(app, appCheckConfig) {
    const { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    if (appCheckConfig.debugToken) {
        globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
            appCheckConfig.debugToken;
    }
    const provider = appCheckConfig.recaptchaEnterpriseSiteKey
        ? new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaEnterpriseSiteKey)
        : new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey);
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
export async function getAppCheckToken() {
    if (!cachedAppCheck)
        return undefined;
    const { getToken } = await import('firebase/app-check');
    const result = await getToken(cachedAppCheck);
    return result.token;
}
let cached;
let cachedPromise;
/**
 * Lazily loads and initializes `firebase/app`/`firebase/auth` — a dynamic
 * import, not a static one, so consumers who never call a firebase_auth
 * export never pull these packages into their bundle or runtime at all.
 * Throws if `firebaseAuth` is missing from `RoutingConfig` (see
 * `require_config.ts`) instead of silently no-op'ing.
 */
export async function getFirebaseAuthClient() {
    requireFirebaseAuthConfig(config.firebaseAuth);
    if (cached)
        return cached;
    if (!cachedPromise) {
        const fa = config.firebaseAuth;
        const isPerformanceEnabled = fa.performance !== false && typeof window !== 'undefined';
        cachedPromise = Promise.all([
            import('firebase/app'),
            import('firebase/auth'),
            isPerformanceEnabled ? import('firebase/performance') : Promise.resolve(null),
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
                cachedAppCheck = await initializeFirebaseAppCheck(app, fa.appCheck);
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
/** Synchronous read of the cached client, or `undefined` before the first `getFirebaseAuthClient()` resolves. */
export function getFirebaseAuthClientSync() {
    return cached;
}
/** Synchronous read of the cached `FirebasePerformance` instance, or `undefined` if `performance` isn't enabled or hasn't initialized yet. */
export function getFirebasePerformanceSync() {
    return cachedPerformance;
}
let cachedAuthModule;
/** Memoized `import('firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export function getFirebaseAuthModule() {
    if (!cachedAuthModule) {
        cachedAuthModule = import('firebase/auth');
    }
    return cachedAuthModule;
}
