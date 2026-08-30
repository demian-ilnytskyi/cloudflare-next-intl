"use client";
import { useContext, useMemo } from "react";
import { LocaleContext } from "../components/client_provider.js";
import { getTranslationsImpl } from "../../general/general_functions.js";
/**
 * Client Component `useLocale` — reached via the default condition of the
 * `cloudflare-next-intl/use` subpath (Server Components get the
 * `use_functions.ts` variant automatically instead; always import from
 * `"cloudflare-next-intl/use"`, never this file directly).
 *
 * Reads the locale from React context set up by `IntlProvider`.
 *
 * @returns The current locale (e.g. `"en"`).
 * @throws If rendered outside `IntlProvider`.
 * @example
 * const locale = useLocale(); // "en"
 */
export function useLocale() {
    const context = useContext(LocaleContext);
    if (context === undefined) {
        throw new Error('useLocale must be used within an IntlProvider');
    }
    return context.language;
}
/**
 * Client Component `useTranslations` — see {@link useLocale} for the
 * subpath-resolution note.
 *
 * @param namespace Dot-separated key prefix into your messages file.
 * @returns A `(key: string) => string` translation function, memoized on
 *   `[language, messages, namespace]`.
 * @throws If rendered outside `IntlProvider`.
 * @example
 * const t = useTranslations("Index");
 * return <h1>{t("title")}</h1>;
 */
export function useTranslations(namespace) {
    const context = useContext(LocaleContext);
    if (context === undefined) {
        throw new Error('useTranslations must be used within an IntlProvider');
    }
    const { language, messages } = context;
    return useMemo(() => getTranslationsImpl(language, messages, namespace), [language, messages, namespace]);
}
