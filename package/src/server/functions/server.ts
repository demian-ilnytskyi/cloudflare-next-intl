import { getTranslationsImpl } from "../../general/general_functions.js";
import config from "../../config/intl_config.js";
import { localeCookieName } from "../../config/cookie_key.js";
import type { TranslationObject, TranslatorReturnType } from "../../types/types.js";
import { getLocaleCache, getMessageCache, getTranslationCache, setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { cache } from "react";
import { localesSet } from "../../config/middleware.js";
import reportError from "../../error_handling/report_error.js";
import type * as NextHeadersModule from "next/headers";

const isDev = process.env.NODE_ENV === 'development';

let nextHeadersModule: typeof NextHeadersModule | undefined;

/**
 * Loads and caches messages for a specific locale using dynamic import.
 * Prevents redundant file loads and handles import errors gracefully.
 * @param locale The locale for which to load messages.
 * @returns A promise that resolves to the TranslationObject for the given locale.
 */
async function iGetMessage(locale: string): Promise<TranslationObject> {
    // In dev, always re-import so editing a messages/*.json file takes effect
    // on the next request without a full server restart. loadedTranslations
    // is a module-level cache that otherwise persists for the whole process.
    const message = isDev ? undefined : getMessageCache(locale);
    if (message) {
        return message;
    } else {
        try {
            // Dynamic import ensures that translation files are only loaded when needed.
            // The `default` export is used as per typical JSON module imports.
            const messages = (await import(`@locale-file/${locale}.json`)).default as TranslationObject;
            setMessageForLocaleCache(locale, messages);
        } catch {
            if (!localesSet.has(locale)) {
                const { notFound } = await import("next/navigation");
                notFound();
                return {};
            }
            throw Error(`Please set localization file and set path to it in next.config as in the example and add json filed ${locale}.json with translations`);
        }
        return getMessageCache(locale)!; // Assert non-null because it's guaranteed to be in the map
    }
}

/**
 * Server-only: loads (and caches) the translation messages for a locale.
 * Use {@link getTranslations} instead unless you need the raw message object.
 *
 * @param locale The locale to load messages for (e.g. `"en"`).
 * @returns The `TranslationObject` for that locale.
 * @throws via `notFound()` if `locale` isn't in your configured locales.
 */
export const getMessage = cache(iGetMessage);

/**
 * Retrieves a translation function for a specific namespace and locale.
 * This function handles caching of both translation files and memoized translation functions.
 * @param namespace The dot-separated namespace (e.g., "common.buttons").
 * @param locale Optional: The specific locale to use. If not provided, it will be determined.
 * @returns A promise that resolves to a function, which takes a key and returns the translated string.
 */
async function iGetTranslations(namespace: string, locale?: string): Promise<TranslatorReturnType> {
    // Determine the effective locale, awaiting getLocale only if not provided.
    const effectiveLocale = locale ?? (await getLocale());
    const cacheKey = `${effectiveLocale}-${namespace}`;

    // Return cached translation function immediately if available. Skipped
    // in dev for the same reason iGetMessage skips its own cache read: a
    // stale translator function built from a since-edited messages/*.json
    // must not survive across requests during local development.
    const cachedTranslation = isDev ? undefined : getTranslationCache(cacheKey);
    if (cachedTranslation) {
        return cachedTranslation;
    }

    // Load messages for the effective locale. This also benefits from caching.
    const serverMessages = await iGetMessage(effectiveLocale);

    return getTranslationsImpl(effectiveLocale, serverMessages, namespace, cacheKey);
}

/**
 * Server Component only: gets a translation function for a namespace.
 *
 * @param namespace Dot-separated key prefix into your messages file
 *   (e.g. `"HomePage"`, `"Common.buttons"`).
 * @param locale    Optional. Defaults to {@link getLocale}'s result — pass
 *   this explicitly only if you already resolved the locale (e.g. from route
 *   params) to avoid an extra lookup.
 * @returns A function `(key: string) => string` that looks up `key` inside
 *   `namespace`.
 *
 * @example
 * ```tsx
 * export default async function Page() {
 *   const t = await getTranslations("HomePage");
 *   return <h1>{t("title")}</h1>;
 * }
 * ```
 */
export const getTranslations = cache(iGetTranslations);

/**
 * Determines the current locale. It first checks for an explicitly set locale,
 * and finally reads from cookies.
 * @returns A promise that resolves to the determined Language.
 */
async function iGetLocale(): Promise<string> {
    // If locale is already set (e.g., via setLocale), return it immediately.
    const localeCache = getLocaleCache();
    if (localeCache) {
        return localeCache;
    }

    try {
        // Dynamically import "next/headers" only when needed.
        // This ensures it's loaded only on the server where cookies are accessible,
        // preventing client-side import errors and reducing bundle size.
        if (!nextHeadersModule) {
            nextHeadersModule = await import("next/headers");
        }
        const cookieStore = await nextHeadersModule.cookies();
        const localeCookie = cookieStore.get(localeCookieName);
        // Use the cookie value or fall back to the default locale.
        const localeValue = (localeCookie?.value as string) ?? config.defaultLocale;
        setLocaleCache(localeValue); // Cache the resolved language for future synchronous access
        return localeValue;
    } catch (error) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error,
            classOrMethodName: 'getLocale',
        });
        setLocaleCache(config.defaultLocale); // Cache fallback language on error
        return config.defaultLocale;
    }
}

/**
 * Server Component only: resolves the current request's locale.
 *
 * Order of resolution: an explicitly-set locale (e.g. via `IntlProvider`)
 * takes priority, then falls back to the `NEXT_LOCALE`-style cookie set by
 * `intlMiddleware`, then to `defaultLocale` from your `setIntlConfig` config.
 *
 * @returns The resolved locale string (e.g. `"en"`).
 *
 * @example
 * ```tsx
 * const locale = await getLocale();
 * ```
 */
export const getLocale = cache(iGetLocale);