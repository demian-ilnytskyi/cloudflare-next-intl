import type { TranslationEntry, TranslationObject, ReturnType, TranslatorReturnType } from "../types/types";
import { setTranslationCache } from "./cache_variables";

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
    console.error(parts.join(' | '));

    const fallbackFn = (k: string) => k; // Fallback function simply returns the key
    setTranslationCache(cacheKey, fallbackFn);
    return fallbackFn;
};

export function getTranslationsImpl(locale: string, messages: TranslationObject, namespace: string, cacheKey?: string): TranslatorReturnType {
    const cacheKeyValue = cacheKey ?? `${locale}-${namespace}`;
    const namespaceParts = namespace.split('.');
    let currentLevel: TranslationEntry | TranslationObject = messages;
    let translationsBase: TranslationObject | undefined;

    // Traverse the translation object based on the namespace parts.
    for (let i = 0; i < namespaceParts.length; i++) {
        const part = namespaceParts[i];

        const nextLevel: TranslationEntry | undefined = currentLevel[part];

        if (i === namespaceParts.length - 1) {
            // Last part of the namespace, should resolve to an object (the base for translations).
            if (typeof nextLevel === 'object' && nextLevel !== null) {
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

    // If after traversal, no base translations object was found.
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

            if (typeof currentTranslation === 'string') {
                // Translation key path prematurely leads to a string.
                console.warn(`Translation key "${key}" in namespace "${namespace}" leads to a string prematurely at "${part}" for locale "${locale}".`);
                return key; // Return the key as fallback
            }

            const value: TranslationEntry = currentTranslation[part];

            if (i === keyParts.length - 1) {
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

        // If the loop completes and no string translation was found (e.g., key missing or not a string).
        console.warn(`Translation key "${key}" in namespace "${namespace}" is missing or not a string for locale "${locale}".`);
        return key; // Return the key as fallback
    };

    setTranslationCache(cacheKeyValue, translateFunction);
    return translateFunction;
}
