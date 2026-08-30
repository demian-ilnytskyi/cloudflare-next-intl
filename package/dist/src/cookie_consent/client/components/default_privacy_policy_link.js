'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import NextLink from 'next/link';
import config from '../../../config/intl_config.js';
import { getLocaleCache } from '../../../general/cache_variables.js';
export default function DefaultPrivacyPolicyLink({ privacyPolicyPath, text, className, style }) {
    if (privacyPolicyPath === false)
        return null;
    const localeValue = getLocaleCache();
    const needsLangPath = localeValue !== config.defaultLocale || !localeValue;
    const href = needsLangPath ? `/${localeValue}${privacyPolicyPath}` : privacyPolicyPath;
    return (_jsx(NextLink, { href: href, className: className, style: style, children: text }));
}
