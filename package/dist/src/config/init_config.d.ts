import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
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
export declare function setIntlConfig<const AppLocales extends Locales, const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>(config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode>;
