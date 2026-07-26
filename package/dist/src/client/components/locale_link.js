import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef, Suspense, } from 'react';
import LocaleLinkClient from './locale_link_client';
function LocaleLinkComponent(params, ref) {
    return _jsx(Suspense, { fallback: _jsx("a", { ...params, ref: ref, className: params.className + ' pointer-events-none' }), children: _jsx(LocaleLinkClient, { ref: ref, ...params }) });
}
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
const LocaleLink = forwardRef(LocaleLinkComponent);
export default LocaleLink;
