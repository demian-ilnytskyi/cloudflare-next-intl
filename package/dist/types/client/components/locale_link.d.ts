import { type LinkProps } from 'next/link';
import { type ComponentProps } from 'react';
type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> & Omit<LinkProps, 'locale' | 'href' | 'prefetch' | 'onNavigate' | 'hrefLang' | 'replace' | 'scroll'>;
export type LocaleLinkProps = NextLinkProps & {
    locale: string;
};
/**
 * Client-only link component for linking to a SPECIFIC locale — e.g. a
 * language switcher. Import from `cloudflare-next-intl/LocaleLink`.
 *
 * For normal in-app navigation that should stay on the current locale, use
 * the server-side `Link` (`cloudflare-next-intl/Link`) instead — it infers
 * the locale automatically and doesn't require `"use client"`.
 *
 * Renders inside a `Suspense` boundary; falls back to a disabled `<a>`
 * (`pointer-events-none`) while resolving.
 *
 * @param locale Required. The locale to link to (e.g. `"de"`), prepended to
 *   `href` regardless of the current locale.
 *
 * @example
 * ```tsx
 * "use client";
 * import LocaleLink from "cloudflare-next-intl/LocaleLink";
 *
 * <LocaleLink href="/about" locale="de">Über uns</LocaleLink> // -> "/de/about"
 * ```
 */
declare const LocaleLink: import("react").ForwardRefExoticComponent<Omit<LocaleLinkProps, "ref"> & import("react").RefAttributes<HTMLAnchorElement>>;
export default LocaleLink;
