import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
import { setIntlConfig as coreSetIntlConfig } from 'cloudflare-next-intl-intl/setIntlConfig';
import { normalizeFirebaseAuthConfig } from 'cloudflare-next-intl-auth/normalizeConfig';

export function setIntlConfig<
    const AppLocales extends Locales,
    const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>
    (config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode> {
    const fa = config.firebaseAuth;
    const normalizedFa = normalizeFirebaseAuthConfig(fa);
    const resolvedConfig = normalizedFa !== fa ? { ...config, firebaseAuth: normalizedFa } : config;
    return coreSetIntlConfig(resolvedConfig as never) as RoutingConfig<AppLocales, AppLocalePrefixMode>;
}
