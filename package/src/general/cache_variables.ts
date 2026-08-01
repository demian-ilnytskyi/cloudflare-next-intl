import type { TranslationObject, TranslatorReturnType } from "../types/types";

// Caches for loaded translation objects and memoized translation functions.
const loadedTranslations = new Map<string, TranslationObject>();
const translationFunctionsCache = new Map<string, TranslatorReturnType>();
let currentLanguage: string | undefined = undefined; // Renamed 'language' to 'currentLanguage' for clarity

/**
 * Sets the current locale.
 * @param locale The language to set.
 */
export function setLocaleCache(locale: string): void {
    currentLanguage = locale;
}

export async function setLocaleAsync(params: Promise<{ locale: string }>): Promise<void> {
    const { locale } = await params;
    setLocaleCache(locale);
}

export function getLocaleCache(): string | undefined {
    return currentLanguage;
}

export function setMessageForLocaleCache(locale: string, message: TranslationObject): void {
    loadedTranslations.set(locale, message);
}

export function getMessageCache(locale?: string): TranslationObject | undefined {
    if (locale && loadedTranslations.has(locale)) {
        return loadedTranslations.get(locale);
    } else {
        return undefined
    }
}

export function setTranslationCache(cache: string, value: TranslatorReturnType): void {
    translationFunctionsCache.set(cache, value);
}

export function getTranslationCache(cacheKey: string): TranslatorReturnType | undefined {
    return translationFunctionsCache.get(cacheKey);
}