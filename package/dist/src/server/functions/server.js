import { getTranslationsImpl } from "../../general/general_functions.js";
import config from "../../config/intl_config.js";
import { localeCookieName } from "../../config/cookie_key.js";
import { getLocaleCache, getMessageCache, getTranslationCache, setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { cache } from "react";
import { localesSet } from "../../config/middleware.js";
import reportError from "../../error_handling/report_error.js";
const isDev = process.env.NODE_ENV === 'development';
let nextHeadersModule;
async function iGetMessage(locale) {
    const message = isDev ? undefined : getMessageCache(locale);
    if (message) {
        return message;
    }
    else {
        try {
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
        return getMessageCache(locale);
    }
}
export const getMessage = cache(iGetMessage);
async function iGetTranslations(namespace, locale) {
    const effectiveLocale = locale ?? (await getLocale());
    const cacheKey = `${effectiveLocale}-${namespace}`;
    const cachedTranslation = isDev ? undefined : getTranslationCache(cacheKey);
    if (cachedTranslation) {
        return cachedTranslation;
    }
    const serverMessages = await iGetMessage(effectiveLocale);
    return getTranslationsImpl(effectiveLocale, serverMessages, namespace, cacheKey);
}
export const getTranslations = cache(iGetTranslations);
async function iGetLocale() {
    const localeCache = getLocaleCache();
    if (localeCache) {
        return localeCache;
    }
    try {
        if (!nextHeadersModule) {
            nextHeadersModule = await import("next/headers");
        }
        const cookieStore = await nextHeadersModule.cookies();
        const localeCookie = cookieStore.get(localeCookieName);
        const localeValue = localeCookie?.value ?? config.defaultLocale;
        setLocaleCache(localeValue);
        return localeValue;
    }
    catch (error) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error,
            classOrMethodName: 'getLocale',
        });
        setLocaleCache(config.defaultLocale);
        return config.defaultLocale;
    }
}
export const getLocale = cache(iGetLocale);
