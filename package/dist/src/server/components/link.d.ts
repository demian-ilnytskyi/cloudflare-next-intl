import { type LinkProps } from 'next/link';
import { type ComponentProps } from 'react';
type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> & Omit<LinkProps, 'locale'>;
/**
 * Server-safe, locale-aware drop-in replacement for `next/link`. Import
 * from `cloudflare-next-intl/Link` (a separate subpath from the client-side
 * `LocaleLink`).
 *
 * Prepends the current locale segment to `href` automatically when the
 * current locale isn't the `defaultLocale` — you never build the
 * `/en/about`-style path yourself. To link to a SPECIFIC locale (a language
 * switcher) use `LocaleLink` instead, which takes an explicit `locale` prop.
 *
 * All other `next/link` props (`prefetch`, `replace`, `scroll`, etc.) and
 * standard `<a>` props are passed straight through.
 *
 * @example
 * ```tsx
 * import Link from "cloudflare-next-intl/Link";
 *
 * <Link href="/about">About</Link> // -> "/about" or "/de/about"
 * ```
 */
declare const Link: import("react").ForwardRefExoticComponent<Omit<NextLinkProps, "ref"> & import("react").RefAttributes<HTMLAnchorElement>>;
export default Link;
