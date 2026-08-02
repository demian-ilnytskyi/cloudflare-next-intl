'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import NextLink from 'next/link';
import config from '../../../config/intl_config';
import { getLocaleCache } from '../../../general/cache_variables';
/**
 * Renders the default privacy-policy link used by `CookieConsentDialog`/
 * `PrivacyPolicyUpdateDialog` when their `link` prop is omitted. Returns
 * `null` when `privacyPolicyPath` is `false` (disabled via
 * `cookieConsent.privacyPolicyPath`). Locale-prefixes `privacyPolicyPath`
 * the same way the server `Link` component does — reads the locale set by
 * `LocationzationClientProvider` on the current render.
 */
export default function DefaultPrivacyPolicyLink({ privacyPolicyPath, text, className, style }) {
    if (privacyPolicyPath === false)
        return null;
    const localeValue = getLocaleCache();
    const needsLangPath = localeValue !== config.defaultLocale || !localeValue;
    const href = needsLangPath ? `/${localeValue}${privacyPolicyPath}` : privacyPolicyPath;
    return (_jsx(NextLink, { href: href, className: className, style: style, children: text }));
}
