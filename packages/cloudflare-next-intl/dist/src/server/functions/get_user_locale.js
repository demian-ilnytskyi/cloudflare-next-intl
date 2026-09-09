import { cache } from "react";
import config from "../../config/intl_config.js";
import { localesSet } from "../../config/middleware.js";
import reportError from "../../error_handling/report_error.js";
export const languageDetecotr = cache(languageDetecotrImpl);
function languageDetecotrImpl(acceptLanguageHeader) {
    try {
        if (!acceptLanguageHeader) {
            return config.defaultLocale;
        }
        const parsedLocales = acceptLanguageHeader
            .split(',');
        let localeValue;
        for (const item of parsedLocales) {
            const trimmed = item.trim();
            const semi = trimmed.indexOf(';');
            const locale = semi === -1 ? trimmed : trimmed.slice(0, semi);
            const dash = locale.indexOf('-');
            const languageOnly = dash === -1 ? locale : locale.slice(0, dash);
            if (languageOnly && localesSet.has(languageOnly)) {
                const eq = semi === -1 ? -1 : trimmed.indexOf('=', semi);
                const q = eq === -1 ? 1 : parseFloat(trimmed.slice(eq + 1));
                if (!localeValue || localeValue.q < q) {
                    localeValue = { locale: languageOnly, q };
                }
            }
        }
        return localeValue ? localeValue.locale : config.defaultLocale;
    }
    catch (e) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error: e,
            classOrMethodName: 'languageDetecotr',
            params: { acceptLanguageHeader },
        });
        return config.defaultLocale;
    }
}
