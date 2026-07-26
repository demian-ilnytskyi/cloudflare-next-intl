import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';

/**
 * Defines and type-checks your app's i18n routing config.
 *
 * Identity function at runtime — it exists purely so TypeScript infers
 * `AppLocales`/`AppLocalePrefixMode` from the literal config object you pass
 * in, giving you autocomplete/type errors on `locale` params elsewhere.
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
    return config;
}