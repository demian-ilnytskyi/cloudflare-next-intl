import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
import { setStaleDeployPatterns } from '../error_handling/is_stale_deploy_error.js';

// Every path this package compares against `request.nextUrl.pathname`
// (always `/`-prefixed) must itself start with `/` — a missing leading
// slash means `path === fa.verifyEmailPath` (and the same check for
// `redirectAuthPath`/`homePath`) never matches, silently disabling that
// redirect/exemption entirely (e.g. an infinite redirect loop on
// `verifyEmailPath` because the page is never recognized as itself).
// Auto-prepending `/` here fixes the common typo (`'login'` instead of
// `'/login'`) at the source, for every consumer, instead of requiring each
// one to notice and fix it themselves.
export function setIntlConfig<
    const AppLocales extends Locales,
    const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>
    (config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode> {
    if (config.errorHandling?.staleDeployPatterns) {
        setStaleDeployPatterns(config.errorHandling.staleDeployPatterns);
    }
    return config;
}