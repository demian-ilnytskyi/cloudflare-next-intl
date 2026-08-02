import type { TranslatorReturnType } from "../../types/types";
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
export declare function useLocaleImpl(): string;
export declare const useLocale: typeof useLocaleImpl;
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
declare function useTranslationsImpl(namespace: string): TranslatorReturnType;
export declare const useTranslations: typeof useTranslationsImpl;
export {};
