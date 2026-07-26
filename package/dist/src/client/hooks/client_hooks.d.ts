import type { TranslatorReturnType } from "../../types/types";
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
 */
export declare function useLocale(): string;
/**
 * Client Component `useTranslations` — see {@link useLocale} for the
 * subpath-resolution note.
 *
 * @param namespace Dot-separated key prefix into your messages file.
 * @returns A `(key: string) => string` translation function, memoized on
 *   `[language, messages, namespace]`.
 * @throws If rendered outside `IntlProvider`.
 */
export declare function useTranslations(namespace: string): TranslatorReturnType;
