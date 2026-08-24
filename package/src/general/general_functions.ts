import type { TranslationEntry, TranslationObject, ReturnType, TranslatorReturnType } from "../types/types";
import { setTranslationCache } from "./cache_variables";
import reportError from "../error_handling/report_error";

/**
 * Logs a warning message and returns a fallback translation function.
 * This function helps in debugging missing translations or incorrect structures.
 * @param message The main warning message.
 * @param cacheKey The key used for caching the translation function.
 * @param locale The effective locale.
 * @param namespace The namespace being accessed.
 * @param key The specific translation key being looked up.
 * @returns A fallback function that returns the key itself.
 */
const errorAndReturnFallback = (
    message: string,
    cacheKey: string,
    locale: string,
    namespace?: string,
    key?: string,
): TranslatorReturnType => {
    const parts = [
        message,
        namespace ? `Namespace: "${namespace}"` : '',
        key ? `Key: "${key}"` : '',
        `Locale: "${locale}"`,
    ].filter(Boolean); // Filter out empty parts
    void reportError(undefined, {
        error: parts.join(' | '),
        classOrMethodName: 'getTranslationsImpl',
        params: { locale, namespace, key },
    });

    const fallbackFn = (k: string) => k; // Fallback function simply returns the key
    (fallbackFn as TranslatorReturnType).raw = (k: string) => k;
    setTranslationCache(cacheKey, fallbackFn as TranslatorReturnType);
    return fallbackFn as TranslatorReturnType;
};

export function getTranslationsImpl(locale: string, messages: TranslationObject, namespace: string, cacheKey?: string): TranslatorReturnType {
    const cacheKeyValue = cacheKey ?? `${locale}-${namespace}`;
    const namespaceParts = namespace.split('.');
    let currentLevel: TranslationEntry | TranslationObject = messages;
    let translationsBase: TranslationObject | undefined;

    // Traverse the translation object based on the namespace parts.
    for (let i = 0; i < namespaceParts.length; i++) {
        const part = namespaceParts[i];

        const nextLevel: TranslationEntry | undefined = Array.isArray(currentLevel) ? undefined : currentLevel[part];

        if (i === namespaceParts.length - 1) {
            // Last part of the namespace, should resolve to an object (the base for translations).
            if (typeof nextLevel === 'object' && nextLevel !== null && !Array.isArray(nextLevel)) {
                translationsBase = nextLevel;
            } else {
                // Namespace does not resolve to an object as expected.
                return errorAndReturnFallback(
                    `Namespace "${namespace}" does not resolve to an object.`,
                    cacheKeyValue, locale, namespace
                );
            }
        } else {
            // Intermediate part of the namespace, must be an object.
            if (typeof nextLevel === 'object' && nextLevel !== null) {
                currentLevel = nextLevel;
            } else {
                // Invalid structure in the middle of the namespace path.
                return errorAndReturnFallback(
                    `Namespace "${namespace}" has invalid structure at "${part}". Expected object, got "${typeof nextLevel}".`,
                    cacheKeyValue, locale, namespace
                );
            }
        }
    }

    // If after traversal, no base translations object was found. Unreachable:
    // the loop above always either sets translationsBase or returns early on
    // its final iteration, since namespaceParts always has length >= 1
    // (''.split('.') yields ['']).
    if (!translationsBase) {
        return errorAndReturnFallback(
            `Translations for namespace "${namespace}" could not be found.`,
            cacheKeyValue, locale, namespace
        );
    }

    /**
     * The actual translation function for a given key within the resolved namespace.
     * @param key The dot-separated translation key (e.g., "title", "description.long").
     * @returns The translated string or the key itself if not found/invalid.
     */
    const translateFunction = (key: string): ReturnType => {
        const keyParts = key.split('.');
        let currentTranslation: TranslationEntry | TranslationObject = translationsBase;

        // Traverse the resolved translations base using the key parts.
        for (let i = 0; i < keyParts.length; i++) {
            const part = keyParts[i];

            // Unreachable: currentTranslation only ever becomes a string via
            // the reassignment below, which is guarded to only assign
            // non-null objects.
            if (typeof currentTranslation === 'string') {
                // Translation key path prematurely leads to a string.
                console.warn(`Translation key "${key}" in namespace "${namespace}" leads to a string prematurely at "${part}" for locale "${locale}".`);
                return key; // Return the key as fallback
            }

            const value: TranslationEntry = Array.isArray(currentTranslation) ? undefined as never : currentTranslation[part];

            if (i === keyParts.length - 1) {
                if (typeof value !== 'string') {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" resolves to a non-string value for locale "${locale}". Expected string, got "${typeof value}".`);
                    return key;
                }
                return value;
            } else {
                // Intermediate part of the key, must be an object.
                if (typeof value === 'object' && value !== null) {
                    currentTranslation = value;
                } else {
                    // Invalid structure in the middle of the translation key path.
                    console.warn(`Translation key "${key}" in namespace "${namespace}" has invalid structure at "${part}" for locale "${locale}". Expected object, got "${typeof value}".`);
                    return key; // Return the key as fallback
                }
            }
        }

        // If the loop completes and no string translation was found (e.g.,
        // key missing or not a string). Unreachable: keyParts always has
        // length >= 1 (''.split('.') yields ['']), and every branch above
        // returns on the final iteration.
        console.warn(`Translation key "${key}" in namespace "${namespace}" is missing or not a string for locale "${locale}".`);
        return key; // Return the key as fallback
    };

    /**
     * `t.raw(key)` — the escape hatch for when a message value isn't a
     * plain string.
     *
     * `t(key)` (the main `translateFunction` above) ALWAYS returns a
     * `string`; if the value at `key` is an array or a nested object, it
     * warns and falls back to returning `key` itself. Use `t.raw(key)`
     * instead whenever your `messages/<locale>.json` stores a list or
     * object under that key (e.g. a list of social links, a table of
     * FAQ entries, a settings sub-object) — it returns the value exactly
     * as it appears in the JSON, unmodified: string stays string, array
     * stays array, object stays object.
     *
     * Mirrors `next-intl`'s `t.raw` API, so existing `next-intl` knowledge
     * transfers directly.
     *
     * @example
     * // messages/en.json: { "Index": { "items": ["a", "b", "c"] } }
     * const t = await getTranslations("Index");
     * const items = t.raw("items") as string[]; // ["a", "b", "c"]
     *
     * @param key Dot-separated path into the resolved namespace, same
     *   format as `translateFunction`'s `key` (e.g. `"items"` or
     *   `"section.list"`).
     * @returns The raw `TranslationEntry` at `key` (string | object | array),
     *   or `key` itself if the path doesn't resolve (missing key, or an
     *   intermediate segment isn't an object) — matching `translateFunction`'s
     *   fallback-to-key behavior on lookup failure.
     */
    const rawFunction = (key: string): TranslationEntry => {
        const keyParts = key.split('.');
        let currentTranslation: TranslationEntry | TranslationObject = translationsBase!;

        for (let i = 0; i < keyParts.length; i++) {
            const part = keyParts[i];

            if (typeof currentTranslation === 'string' || Array.isArray(currentTranslation)) {
                console.warn(`Translation key "${key}" in namespace "${namespace}" leads to a non-object prematurely at "${part}" for locale "${locale}".`);
                return key;
            }

            const value: TranslationEntry = currentTranslation[part];

            if (i === keyParts.length - 1) {
                if (value === undefined) {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" is missing for locale "${locale}".`);
                    return key;
                }
                return value;
            } else {
                if (typeof value === 'object' && value !== null) {
                    currentTranslation = value;
                } else {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" has invalid structure at "${part}" for locale "${locale}". Expected object, got "${typeof value}".`);
                    return key;
                }
            }
        }

        return key;
    };

    // Attach `.raw` onto the same callable function object so callers get
    // one value that works both as `t(key)` and `t.raw(key)`, exactly like
    // `next-intl`'s translator shape.
    (translateFunction as TranslatorReturnType).raw = rawFunction;

    setTranslationCache(cacheKeyValue, translateFunction as TranslatorReturnType);
    return translateFunction as TranslatorReturnType;
}
