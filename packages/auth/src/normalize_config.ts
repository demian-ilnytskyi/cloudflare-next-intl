import type { FirebaseAuthRoutingConfig } from './types.js';

const FIREBASE_AUTH_PATH_FIELDS = [
    'redirectAuthPath',
    'homePath',
    'verifyEmailPath',
    'resetPasswordPath',
    'recoverEmailPath',
    'actionLinkPath',
] as const;

export const MIN_CUSTOM_TOKEN_TTL_SECONDS = 30 * 60;
export const MAX_CUSTOM_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function normalizeFirebaseAuthConfig(
    fa: FirebaseAuthRoutingConfig | undefined,
): FirebaseAuthRoutingConfig | undefined {
    if (!fa) return undefined;

    const ttl = fa.appCheck?.customTokenTtlSeconds;
    if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < MIN_CUSTOM_TOKEN_TTL_SECONDS || ttl > MAX_CUSTOM_TOKEN_TTL_SECONDS)) {
        throw new Error(
            `[cloudflare-next-intl] firebaseAuth.appCheck.customTokenTtlSeconds (${ttl}) must be an integer between ` +
            `${MIN_CUSTOM_TOKEN_TTL_SECONDS} (30 minutes) and ${MAX_CUSTOM_TOKEN_TTL_SECONDS} (7 days) — Firebase App Check rejects any other value.`,
        );
    }

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
