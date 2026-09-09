const loadedTranslations = new Map();
const translationFunctionsCache = new Map();
let currentLanguage = undefined;
export function setLocaleCache(locale) {
    currentLanguage = locale;
}
export async function setLocaleAsync(params) {
    const { locale } = await params;
    setLocaleCache(locale);
}
export function getLocaleCache() {
    return currentLanguage;
}
export function setMessageForLocaleCache(locale, message) {
    loadedTranslations.set(locale, message);
}
export function getMessageCache(locale) {
    return locale ? loadedTranslations.get(locale) : undefined;
}
export function setTranslationCache(cache, value) {
    translationFunctionsCache.set(cache, value);
}
export function getTranslationCache(cacheKey) {
    return translationFunctionsCache.get(cacheKey);
}
