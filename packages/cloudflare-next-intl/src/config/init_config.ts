import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
import { setIntlConfig as coreSetIntlConfig } from 'cloudflare-next-intl-intl/setIntlConfig';
import { normalizeFirebaseAuthConfig } from 'cloudflare-next-intl-auth/normalizeConfig';
import reportError from 'cloudflare-next-intl-errors/internal/reportError';
import { setStaleDeployPatterns } from 'cloudflare-next-intl-errors/isStaleDeployError';

export function setIntlConfig<
    const AppLocales extends Locales,
    const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>
    (config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode> {
    const fa = config.firebaseAuth;
    const normalizedFa = normalizeFirebaseAuthConfig(fa);
    const resolvedConfig = normalizedFa !== fa ? { ...config, firebaseAuth: normalizedFa } : config;

    if (config.errorHandling?.staleDeployPatterns) {
        setStaleDeployPatterns(config.errorHandling.staleDeployPatterns);
    }

    const onError = config.onError ?? ((error: unknown, source: string) => {
        void reportError(
            { errorHandling: config.errorHandling, generate: config.generate },
            { error, classOrMethodName: source },
        );
    });

    const finalConfig = { ...resolvedConfig, onError };
    coreSetIntlConfig(finalConfig);
    return finalConfig as RoutingConfig<AppLocales, AppLocalePrefixMode>;
}
