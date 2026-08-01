import type { FirebaseAuthRoutingConfig } from '../types/types';

/**
 * Every firebase_auth export calls this before touching `firebase/*`. Throws
 * instead of silently no-op'ing so a consumer who calls e.g. `useAuthUser()`
 * without setting `firebaseAuth` on their `RoutingConfig` gets an immediate,
 * actionable error rather than a silent null/undefined.
 */
export default function requireFirebaseAuthConfig(
    fa: FirebaseAuthRoutingConfig | undefined,
): asserts fa is FirebaseAuthRoutingConfig {
    if (!fa) {
        throw new Error(
            'firebase_auth: `firebaseAuth` is not set on your RoutingConfig. ' +
            'Add a `firebaseAuth` object (Firebase project config + route config) ' +
            'to the config passed to `setIntlConfig` before using any firebase_auth export.',
        );
    }
}
