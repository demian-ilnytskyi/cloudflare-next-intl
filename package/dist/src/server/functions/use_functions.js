import { getTranslationsImpl } from "../../general/general_functions.js";
import { getLocale, getMessage } from "./server.js";
import { getTranslationCache } from "../../general/cache_variables.js";
import { cache, use } from "react";
const isDev = process.env.NODE_ENV === 'development';
export function useLocaleImpl() {
    const language = use(getLocale());
    if (language === undefined) {
        throw new Error('useLocale must be used within an IntlProvider');
    }
    return language;
}
export const useLocale = cache(useLocaleImpl);
function useTranslationsImpl(namespace) {
    const language = use(getLocale());
    if (!language) {
        throw new Error('useTranslations must be used within an IntlProvider');
    }
    const cacheKey = `${language}-${namespace}`;
    const cachedTranslation = isDev ? undefined : getTranslationCache(cacheKey);
    if (cachedTranslation) {
        return cachedTranslation;
    }
    const messages = use(getMessage(language));
    if (!messages) {
        throw new Error('useTranslations must be used within an IntlProvider');
    }
    return getTranslationsImpl(language, messages, namespace, cacheKey);
}
export const useTranslations = cache(useTranslationsImpl);
