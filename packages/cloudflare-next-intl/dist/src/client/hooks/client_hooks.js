"use client";
import { useContext, useMemo } from "react";
import { LocaleContext } from "../components/client_provider.js";
import { getTranslationsImpl } from "../../general/general_functions.js";
export function useLocale() {
    const context = useContext(LocaleContext);
    if (context === undefined) {
        throw new Error('useLocale must be used within an IntlProvider');
    }
    return context.language;
}
export function useTranslations(namespace) {
    const context = useContext(LocaleContext);
    if (context === undefined) {
        throw new Error('useTranslations must be used within an IntlProvider');
    }
    const { language, messages } = context;
    return useMemo(() => getTranslationsImpl(language, messages, namespace), [language, messages, namespace]);
}
