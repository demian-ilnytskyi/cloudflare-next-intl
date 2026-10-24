import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
import { setIntlConfig as coreSetIntlConfig } from 'cloudflare-next-intl-intl/setIntlConfig';

const FIREBASE_AUTH_PATH_FIELDS = [
    'redirectAuthPath',
    'homePath',
    'verifyEmailPath',
    'resetPasswordPath',
    'recoverEmailPath',
    'actionLinkPath',
] as const;

function normalizeFirebaseAuthPaths<T extends RoutingConfig<Locales, LocalePrefixMode>>(config: T): T {
    const fa = config.firebaseAuth;
    if (!fa) return config;

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

    if (!changed) return config;
    return { ...config, firebaseAuth: normalizedFa };
}

export function setIntlConfig<
    const AppLocales extends Locales,
    const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>
    (config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode> {
    const normalized = normalizeFirebaseAuthPaths(config);
    return coreSetIntlConfig(normalized as never) as RoutingConfig<AppLocales, AppLocalePrefixMode>;
}
