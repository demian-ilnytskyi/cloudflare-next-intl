import type { TranslationObject, TranslatorReturnType } from "../../types/types";
/**
 * Loads and caches messages for a specific locale using dynamic import.
 * Prevents redundant file loads and handles import errors gracefully.
 * @param locale The locale for which to load messages.
 * @returns A promise that resolves to the TranslationObject for the given locale.
 */
declare function iGetMessage(locale: string): Promise<TranslationObject>;
/**
 * Server-only: loads (and caches) the translation messages for a locale.
 * Use {@link getTranslations} instead unless you need the raw message object.
 *
 * @param locale The locale to load messages for (e.g. `"en"`).
 * @returns The `TranslationObject` for that locale.
 * @throws via `notFound()` if `locale` isn't in your configured locales.
 */
export declare const getMessage: typeof iGetMessage;
/**
 * Retrieves a translation function for a specific namespace and locale.
 * This function handles caching of both translation files and memoized translation functions.
 * @param namespace The dot-separated namespace (e.g., "common.buttons").
 * @param locale Optional: The specific locale to use. If not provided, it will be determined.
 * @returns A promise that resolves to a function, which takes a key and returns the translated string.
 */
declare function iGetTranslations(namespace: string, locale?: string): Promise<TranslatorReturnType>;
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
export declare const getTranslations: typeof iGetTranslations;
/**
 * Determines the current locale. It first checks for an explicitly set locale,
 * and finally reads from cookies.
 * @returns A promise that resolves to the determined Language.
 */
declare function iGetLocale(): Promise<string>;
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
export declare const getLocale: typeof iGetLocale;
export {};
