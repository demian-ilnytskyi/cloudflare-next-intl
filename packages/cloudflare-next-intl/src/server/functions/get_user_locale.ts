import { cache } from "react";
import config from "../../config/intl_config.js";
import { localesSet } from "../../config/middleware.js";
import reportError from "../../error_handling/report_error.js";

export const languageDetecotr = cache(languageDetecotrImpl);

// Helper function to determine the best matching locale from the Accept-Language header
function languageDetecotrImpl(
    acceptLanguageHeader: string | null,
): string {
    try {
        if (!acceptLanguageHeader) {
            return config.defaultLocale;
        }

        // Parse the Accept-Language header, e.g., "en-US,en;q=0.9,es;q=0.8"
        // Key difference: parse q-value immediately and sort by it
        const parsedLocales = acceptLanguageHeader
            .split(',');
        let localeValue: { locale: string, q: number } | undefined;

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

        // If none of the languages in the Accept-Language header are supported, return the default locale
        return localeValue ? localeValue.locale : config.defaultLocale;
    } catch (e) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error: e,
            classOrMethodName: 'languageDetecotr',
            params: { acceptLanguageHeader },
        });
        return config.defaultLocale;
    }
}