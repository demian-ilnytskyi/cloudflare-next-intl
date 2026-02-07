import type { TranslatorReturnType } from "../../types/types";
import { getTranslationsImpl } from "../../general/general_functions";
import { getLocale, getMessage } from "./server";
import { cache, use } from "react";

export function useLocaleImpl(): string {
    const language = use(getLocale());
    if (language === undefined) {
        throw new Error('Please set IntlProvider before using useLocale');
    }
    return language;
}

export const useLocale = cache(useLocaleImpl);

function useTranslationsImpl(namespace: string): TranslatorReturnType {
    const language = use(getLocale());
    const messages = use(getMessage(language));

    if (!language || !messages) {
        throw new Error('Please set IntlProvider before using useTranslations');
    }

    return getTranslationsImpl(language, messages, namespace);
}

export const useTranslations = cache(useTranslationsImpl);