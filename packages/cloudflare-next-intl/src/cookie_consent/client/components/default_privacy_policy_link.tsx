'use client';

import NextLink from 'next/link.js';
import config from '../../../config/intl_config.js';
import { getLocaleCache } from '../../../general/cache_variables.js';

/**
 * Renders the default privacy-policy link used by `CookieConsentDialog`/
 * `PrivacyPolicyUpdateDialog` when their `link` prop is omitted. Returns
 * `null` when `privacyPolicyPath` is `false` (disabled via
 * `cookieConsent.privacyPolicyPath`). Locale-prefixes `privacyPolicyPath`
 * the same way the server `Link` component does — reads the locale set by
 * `LocationzationClientProvider` on the current render.
 */
export default function DefaultPrivacyPolicyLink({ privacyPolicyPath, text, className, style }: {
    privacyPolicyPath: string | false;
    text: string;
    className?: string;
    style?: React.CSSProperties;
}): React.ReactElement | null {
    if (privacyPolicyPath === false) return null;

    const localeValue = getLocaleCache();
    // An unset cache degrades to the default locale's unprefixed URL rather
    // than a `/undefined${privacyPolicyPath}` href — see the matching fix
    // and comment on the server `Link` component.
    const needsLangPath = localeValue !== undefined && localeValue !== config.defaultLocale;
    const href = needsLangPath ? `/${localeValue}${privacyPolicyPath}` : privacyPolicyPath;

    return (
        <NextLink href={href} className={className} style={style}>
            {text}
        </NextLink>
    );
}
