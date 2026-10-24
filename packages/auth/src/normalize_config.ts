import type { FirebaseAuthRoutingConfig } from './types.js';

const FIREBASE_AUTH_PATH_FIELDS = [
    'redirectAuthPath',
    'homePath',
    'verifyEmailPath',
    'resetPasswordPath',
    'recoverEmailPath',
    'actionLinkPath',
] as const;

export function normalizeFirebaseAuthConfig(
    fa: FirebaseAuthRoutingConfig | undefined,
): FirebaseAuthRoutingConfig | undefined {
    if (!fa) return undefined;

    let changed = false;
    const normalizedFa = { ...fa };
    for (const field of FIREBASE_AUTH_PATH_FIELDS) {
        const value = normalizedFa[field];
        if (typeof value === 'string' && value !== '' && !value.startsWith('/')) {
            console.warn(
                `[cloudflare-next-intl] firebaseAuth.${field} ("${value}") is missing its leading "/" — ` +
                `auto-corrected to "/${value}". Paths are compared against the URL pathname (always ` +
                `"/"-prefixed), so without this fix the check would never match and silently disable the ` +
                `redirect/exemption for this path. Fix your config to avoid this warning.`,
            );
            (normalizedFa as Record<string, unknown>)[field] = `/${value}`;
            changed = true;
        }
    }

    if (!changed) return fa;
    return normalizedFa;
}
