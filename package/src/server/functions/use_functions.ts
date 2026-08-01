import type { TranslatorReturnType } from "../../types/types";
import { getTranslationsImpl } from "../../general/general_functions";
import { getLocale, getMessage } from "./server";
import { getTranslationCache } from "../../general/cache_variables";
import { cache, use } from "react";

const isDev = process.env.NODE_ENV === 'development';

/**
 * React Server Component `useLocale`, reached via the `cloudflare-next-intl/use`
 * subpath's `react-server` condition (resolved automatically — you always
 * just `import { useLocale } from "cloudflare-next-intl/use"`; the matching
 * client-hook version from `client_hooks.ts` is used automatically in client
 * components instead).
 *
 * Uses React's `use()` on the locale promise resolved by `getLocale()`/
 * `IntlProvider` — must be called within a component tree wrapped in
 * `IntlProvider`.
 *
 * @returns The current locale (e.g. `"en"`).
 * @throws If called without an `IntlProvider` above it in the tree.
 * @example
 * const locale = useLocale(); // "en"
 */
export function useLocaleImpl(): string {
    const language = use(getLocale());
    if (language === undefined) {
        throw new Error('useLocale must be used within an IntlProvider');
    }
    return language;
}

export const useLocale = cache(useLocaleImpl);

/**
 * React Server Component `useTranslations` — see {@link useLocaleImpl} for
 * the `react-server`/client resolution note.
 *
 * @param namespace Dot-separated key prefix into your messages file.
 * @returns A `(key: string) => string` translation function.
 * @throws If called without an `IntlProvider` above it in the tree.
 * @example
 * const t = useTranslations("Index");
 * return <h1>{t("title")}</h1>;
 */
function useTranslationsImpl(namespace: string): TranslatorReturnType {
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