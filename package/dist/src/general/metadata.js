import { cache } from "react";
import config from "../config/intl_config";
/**
 * Builds the `alternates` field for Next's `generateMetadata` — a canonical
 * URL plus per-locale `hreflang` links, exported memoized as `alternatesLinks`
 * from `cloudflare-next-intl/metadata`.
 *
 * @param url        Absolute base URL of your site (no locale, no path),
 *   e.g. `"https://example.com"`.
 * @param locale     The current page's locale — used to decide the
 *   `canonical` URL (only set for `defaultLocale` unless you pass one).
 * @param linkPart   The path segment after the locale, e.g. `"/about"`.
 *   Pass `"/"` or omit for the root page.
 * @param canonical  Optional override for the canonical URL.
 * @returns `{ canonical, languages }` ready to spread into `Metadata.alternates`,
 *   or `undefined` if building the links threw (logged, not re-thrown).
 *
 * @example
 * ```ts
 * export async function generateMetadata({ params }) {
 *   const { locale } = await params;
 *   return {
 *     alternates: alternatesLinks({ url: "https://example.com", locale, linkPart: "/about" }),
 *   };
 * }
 * ```
 */
export function iAlternatesLinks({ locale, url, canonical, linkPart }) {
    try {
        const linkPartValue = linkPart == '/' ? undefined : linkPart;
        return {
            canonical: canonical ?? (locale === config.defaultLocale ? `${url}${linkPartValue ?? ''}` : undefined),
            languages: languages(url, linkPartValue),
        };
    }
    catch (e) {
        console.error(`[cloudflare-next-intl] alternatesLinks failed for url="${url}" linkPart="${linkPart}" — returning undefined, so "alternates" will be omitted from your metadata. Underlying error:`, e);
        return undefined;
    }
}
export const alternatesLinks = cache(iAlternatesLinks);
function iLanguages(url, linkPart) {
    return config.locales.reduce((acc, locale) => {
        const localeValue = locale === config.defaultLocale ? '' : `/${locale}`;
        acc[locale] = url + localeValue + (linkPart ?? '');
        return acc;
    }, { 'x-default': url + (linkPart ?? '') });
}
export const languages = cache(iLanguages);
