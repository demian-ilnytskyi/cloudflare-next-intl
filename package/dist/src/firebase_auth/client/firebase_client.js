'use client';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
async function initializeFirebaseAppCheck(app, appCheckConfig) {
    const { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    if (appCheckConfig.debugToken) {
        globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    const provider = appCheckConfig.recaptchaEnterpriseSiteKey
        ? new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaEnterpriseSiteKey)
        : new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey);
    initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: appCheckConfig.isTokenAutoRefreshEnabled ?? true,
    });
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
        cachedPromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(async ([{ getApp, getApps, initializeApp }, { getAuth }]) => {
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
            if (fa.appCheck) {
                await initializeFirebaseAppCheck(app, fa.appCheck);
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
let cachedAuthModule;
/** Memoized `import('firebase/auth')` — see {@link getFirebaseAuthClient} for why this is worth caching. */
export function getFirebaseAuthModule() {
    if (!cachedAuthModule) {
        cachedAuthModule = import('firebase/auth');
    }
    return cachedAuthModule;
}
