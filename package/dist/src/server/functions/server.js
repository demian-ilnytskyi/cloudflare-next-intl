import { getTranslationsImpl } from "../../general/general_functions";
import config from "../../config/intl_config";
import { localeCookieName } from "../../config/cookie_key";
import { getLocaleCache, getMessageCache, setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { cache } from "react";
import { localesSet } from "../../config/middleware";
/**
 * Loads and caches messages for a specific locale using dynamic import.
 * Prevents redundant file loads and handles import errors gracefully.
 * @param locale The locale for which to load messages.
 * @returns A promise that resolves to the TranslationObject for the given locale.
 */
async function iGetMessage(locale) {
    const message = getMessageCache(locale);
    if (message) {
        return message;
    }
    else {
        try {
            // Dynamic import ensures that translation files are only loaded when needed.
            // The `default` export is used as per typical JSON module imports.
            const messages = (await import(`@locale-file/${locale}.json`)).default;
            setMessageForLocaleCache(locale, messages);
        }
        catch {
            if (!localesSet.has(locale)) {
                const { notFound } = await import("next/navigation");
                notFound();
                return {};
            }
            throw Error(`Please set localization file and set path to it in next.config as in the example and add json filed ${locale}.json with translations`);
        }
        return getMessageCache(locale); // Assert non-null because it's guaranteed to be in the map
    }
}
export const getMessage = cache(iGetMessage);
/**
 * Retrieves a translation function for a specific namespace and locale.
 * This function handles caching of both translation files and memoized translation functions.
 * @param namespace The dot-separated namespace (e.g., "common.buttons").
 * @param locale Optional: The specific locale to use. If not provided, it will be determined.
 * @returns A promise that resolves to a function, which takes a key and returns the translated string.
 */
async function iGetTranslations(namespace, locale) {
    // Determine the effective locale, awaiting getLocale only if not provided.
    const effectiveLocale = locale ?? (await getLocale());
    const cacheKey = `${effectiveLocale}-${namespace}`;
    // Return cached translation function immediately if available.
    // if (translationFunctionsCache.has(cacheKey)) {
    //     return translationFunctionsCache.get(cacheKey)!;
    // }
    // Load messages for the effective locale. This also benefits from caching.
    const serverMessages = await iGetMessage(effectiveLocale);
    return getTranslationsImpl(effectiveLocale, serverMessages, namespace, cacheKey);
}
export const getTranslations = cache(iGetTranslations);
/**
 * Determines the current locale. It first checks for an explicitly set locale,
 * and finally reads from cookies.
 * @returns A promise that resolves to the determined Language.
 */
async function iGetLocale() {
    // If locale is already set (e.g., via setLocale), return it immediately.
    const localeCache = getLocaleCache();
    if (localeCache) {
        return localeCache;
    }
    try {
        // Dynamically import "next/headers" only when needed.
        // This ensures it's loaded only on the server where cookies are accessible,
        // preventing client-side import errors and reducing bundle size.
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const localeCookie = cookieStore.get(localeCookieName);
        // Use the cookie value or fall back to the default locale.
        const localeValue = localeCookie?.value ?? config.defaultLocale;
        setLocaleCache(localeValue); // Cache the resolved language for future synchronous access
        return localeValue;
    }
    catch (error) {
        console.error(`Error accessing cookies in getLocale, falling back to default: ${error}`);
        setLocaleCache(config.defaultLocale); // Cache fallback language on error
        return config.defaultLocale;
    }
}
export const getLocale = cache(iGetLocale);
