import { jsx as _jsx } from "react/jsx-runtime";
import LinkComponent from 'next/link';
import { forwardRef, } from 'react';
import config from '../../config/intl_config';
import { getLocaleCache } from '../../general/cache_variables';
function CustomLinkFunction({ href, prefetch, ...rest }, ref) {
    const localeValue = getLocaleCache();
    const needsLangPath = localeValue !== config.defaultLocale || !localeValue;
    let pathnames;
    if (needsLangPath) {
        let pathname;
        if (typeof href === 'object') {
            pathname = href.pathname || '';
        }
        else {
            pathname = href;
        }
        pathnames = `/${localeValue}${pathname}`;
    }
    else {
        pathnames = href;
    }
    return _jsx(LinkComponent, { ref: ref, href: pathnames, prefetch: prefetch, ...rest });
}
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
const Link = forwardRef(CustomLinkFunction);
export default Link;
