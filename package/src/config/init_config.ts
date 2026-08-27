import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
import { setStaleDeployPatterns } from '../error_handling/is_stale_deploy_error';

// Every path this package compares against `request.nextUrl.pathname`
// (always `/`-prefixed) must itself start with `/` — a missing leading
// slash means `path === fa.verifyEmailPath` (and the same check for
// `redirectAuthPath`/`homePath`) never matches, silently disabling that
// redirect/exemption entirely (e.g. an infinite redirect loop on
// `verifyEmailPath` because the page is never recognized as itself).
// Auto-prepending `/` here fixes the common typo (`'login'` instead of
// `'/login'`) at the source, for every consumer, instead of requiring each
// one to notice and fix it themselves.
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

/**
 * Defines and type-checks your app's i18n routing config.
 *
 * Mostly an identity function at runtime — it exists primarily so
 * TypeScript infers `AppLocales`/`AppLocalePrefixMode` from the literal
 * config object you pass in, giving you autocomplete/type errors on
 * `locale` params elsewhere. The one runtime behavior: if `firebaseAuth` is
 * set, `redirectAuthPath`/`homePath`/`verifyEmailPath` are auto-corrected to
 * start with `/` (with a console warning) if you forgot it — see
 * `normalizeFirebaseAuthPaths` above for why that specific typo is worth
 * guarding against.
 *
 * Export the result from the file referenced by `@intl-config` (see your
 * `next.config`), e.g.:
 * ```ts
 * export default setIntlConfig({
 *   locales: ["en", "fr"] as const,
 *   defaultLocale: "en",
 * });
 * ```
 */
export function setIntlConfig<
    const AppLocales extends Locales,
    const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>
    (config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode> {
    if (config.errorHandling?.staleDeployPatterns) {
        setStaleDeployPatterns(config.errorHandling.staleDeployPatterns);
    }
    return normalizeFirebaseAuthPaths(config);
}