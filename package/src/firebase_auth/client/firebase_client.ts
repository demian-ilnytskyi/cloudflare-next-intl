'use client';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';

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
        cachedPromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(
            ([{ getApp, getApps, initializeApp }, { getAuth }]) => {
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
