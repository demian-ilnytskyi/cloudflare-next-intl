import { cache } from "react";
import config from "../config/intl_config.js";
import reportError from "../error_handling/report_error.js";
export function iAlternatesLinks({ locale, url, canonical, linkPart }) {
    try {
        const linkPartValue = linkPart == '/' ? undefined : linkPart;
        return {
            canonical: canonical ?? (locale === config.defaultLocale ? `${url}${linkPartValue ?? ''}` : undefined),
            languages: languages(url, linkPartValue),
        };
    }
    catch (e) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error: e,
            classOrMethodName: 'alternatesLinks',
            params: { url, linkPart },
        });
        return undefined;
    }
}
export const alternatesLinks = cache(iAlternatesLinks);
function iLanguages(url, linkPart) {
    return config.locales.reduce((acc, locale) => {
        const localeValue = locale === config.defaultLocale ? '' : `/${locale}`;
        acc[locale] = url + localeValue + (linkPart ?? '');
        return acc;
    }, { 'x-default': url + (linkPart ?? '') });
}
export const languages = cache(iLanguages);
