import config from "../../config/intl_config.js";
/**
 * Generates the `[locale]` route params for every configured locale — pass
 * directly as your `[locale]/layout.tsx`'s `generateStaticParams` so Next
 * pre-renders/statically-generates a route for each locale.
 *
 * @returns One `{ locale }` object per entry in your `setIntlConfig({ locales })`.
 *
 * @example
 * ```tsx
 * export const generateStaticParams = getLocaleStaticParams;
 * ```
 */
export function getLocaleStaticParams() {
    return config.locales.map((locale) => ({ locale }));
}
