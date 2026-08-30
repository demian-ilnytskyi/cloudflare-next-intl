import { setTranslationCache } from "./cache_variables.js";
import reportError from "../error_handling/report_error.js";
const errorAndReturnFallback = (message, cacheKey, locale, namespace, key) => {
    const parts = [
        message,
        namespace ? `Namespace: "${namespace}"` : '',
        key ? `Key: "${key}"` : '',
        `Locale: "${locale}"`,
    ].filter(Boolean);
    void reportError(undefined, {
        error: parts.join(' | '),
        classOrMethodName: 'getTranslationsImpl',
        params: { locale, namespace, key },
    });
    const fallbackFn = (k) => k;
    fallbackFn.raw = (k) => k;
    setTranslationCache(cacheKey, fallbackFn);
    return fallbackFn;
};
export function getTranslationsImpl(locale, messages, namespace, cacheKey) {
    const cacheKeyValue = cacheKey ?? `${locale}-${namespace}`;
    const namespaceParts = namespace.split('.');
    let currentLevel = messages;
    let translationsBase;
    for (let i = 0; i < namespaceParts.length; i++) {
        const part = namespaceParts[i];
        const nextLevel = Array.isArray(currentLevel) ? undefined : currentLevel[part];
        if (i === namespaceParts.length - 1) {
            if (typeof nextLevel === 'object' && nextLevel !== null && !Array.isArray(nextLevel)) {
                translationsBase = nextLevel;
            }
            else {
                return errorAndReturnFallback(`Namespace "${namespace}" does not resolve to an object.`, cacheKeyValue, locale, namespace);
            }
        }
        else {
            if (typeof nextLevel === 'object' && nextLevel !== null) {
                currentLevel = nextLevel;
            }
            else {
                return errorAndReturnFallback(`Namespace "${namespace}" has invalid structure at "${part}". Expected object, got "${typeof nextLevel}".`, cacheKeyValue, locale, namespace);
            }
        }
    }
    if (!translationsBase) {
        return errorAndReturnFallback(`Translations for namespace "${namespace}" could not be found.`, cacheKeyValue, locale, namespace);
    }
    const translateFunction = (key) => {
        const keyParts = key.split('.');
        let currentTranslation = translationsBase;
        for (let i = 0; i < keyParts.length; i++) {
            const part = keyParts[i];
            if (typeof currentTranslation === 'string') {
                console.warn(`Translation key "${key}" in namespace "${namespace}" leads to a string prematurely at "${part}" for locale "${locale}".`);
                return key;
            }
            const value = Array.isArray(currentTranslation) ? undefined : currentTranslation[part];
            if (i === keyParts.length - 1) {
                if (typeof value !== 'string') {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" resolves to a non-string value for locale "${locale}". Expected string, got "${typeof value}".`);
                    return key;
                }
                return value;
            }
            else {
                if (typeof value === 'object' && value !== null) {
                    currentTranslation = value;
                }
                else {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" has invalid structure at "${part}" for locale "${locale}". Expected object, got "${typeof value}".`);
                    return key;
                }
            }
        }
        console.warn(`Translation key "${key}" in namespace "${namespace}" is missing or not a string for locale "${locale}".`);
        return key;
    };
    const rawFunction = (key) => {
        const keyParts = key.split('.');
        let currentTranslation = translationsBase;
        for (let i = 0; i < keyParts.length; i++) {
            const part = keyParts[i];
            if (typeof currentTranslation === 'string' || Array.isArray(currentTranslation)) {
                console.warn(`Translation key "${key}" in namespace "${namespace}" leads to a non-object prematurely at "${part}" for locale "${locale}".`);
                return key;
            }
            const value = currentTranslation[part];
            if (i === keyParts.length - 1) {
                if (value === undefined) {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" is missing for locale "${locale}".`);
                    return key;
                }
                return value;
            }
            else {
                if (typeof value === 'object' && value !== null) {
                    currentTranslation = value;
                }
                else {
                    console.warn(`Translation key "${key}" in namespace "${namespace}" has invalid structure at "${part}" for locale "${locale}". Expected object, got "${typeof value}".`);
                    return key;
                }
            }
        }
        return key;
    };
    translateFunction.raw = rawFunction;
    setTranslationCache(cacheKeyValue, translateFunction);
    return translateFunction;
}
