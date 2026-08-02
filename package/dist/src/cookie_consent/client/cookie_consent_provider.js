'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import config from '../../config/intl_config';
import requireCookieConsentConfig from '../require_config';
import getCookie from '../../client/functions/get_cookie';
import setCookie from '../../client/functions/set_cookie';
import { cookieConsentCookieKey, privacyPolicyDateCookieKey } from '../../config/cookie_key';
export const CookieConsentContext = createContext(null);
function parseConsent(raw) {
    if (raw === 'true')
        return true;
    if (raw === 'false')
        return false;
    return null;
}
/**
 * Provides cookie-consent + privacy-policy-update state to
 * `useCookieConsent()` and the default `CookieConsentDialog`/
 * `PrivacyPolicyUpdateDialog` components. Requires `cookieConsent` to be set
 * on the `RoutingConfig` passed to `setIntlConfig` — throws a descriptive
 * error otherwise.
 *
 * The privacy-policy-update banner turns on automatically, and only when
 * `cookieConsent.privacyPolicyDate` is configured: once a visitor has
 * consented, if their stored consent date predates `privacyPolicyDate`,
 * `privacyPolicyUpdated` becomes `true` until they call
 * `acknowledgePrivacyPolicyUpdate()` — or until they navigate to
 * `cookieConsent.privacyPolicyPath`, which auto-acknowledges it (visiting
 * the page counts as having seen the update; skipped entirely when
 * `privacyPolicyPath` is `false`).
 *
 * @param requiresConsent Resolved server-side from
 *   `cookieConsent.getCountryCode`/`gdprCountries` — `false` means the
 *   visitor's country doesn't require the banner at all, so a first-time
 *   visitor (no stored cookie) gets `consent` seeded to `true` instead of
 *   `null`, skipping the dialog and unlocking analytics immediately.
 *   Defaults to `true` (always show the banner) when omitted, e.g. when
 *   `cookieConsent.getCountryCode` isn't configured.
 *
 * @example
 * ```tsx
 * <CookieConsentProvider>
 *   {children}
 *   <CookieConsentDialog />
 *   <PrivacyPolicyUpdateDialog />
 * </CookieConsentProvider>
 * ```
 */
export default function CookieConsentProvider({ requiresConsent = true, children }) {
    const { consentCookieName, dateCookieName, maxAge, policyDate, privacyPolicyPath } = useMemo(() => {
        const cc = requireCookieConsentConfig(config.cookieConsent);
        return {
            consentCookieName: cc.consentCookieName ?? cookieConsentCookieKey,
            dateCookieName: cc.privacyPolicyDateCookieName ?? privacyPolicyDateCookieKey,
            maxAge: cc.cookieMaxAge ?? 31536000,
            policyDate: cc.privacyPolicyDate ? new Date(cc.privacyPolicyDate) : null,
            privacyPolicyPath: cc.privacyPolicyPath ?? '/privacy-policy',
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [consent, setConsentState] = useState(null);
    const [privacyPolicyUpdated, setPrivacyPolicyUpdated] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();
    useEffect(() => {
        const storedConsent = parseConsent(getCookie(consentCookieName));
        const autoAccepted = storedConsent === null && !requiresConsent;
        setConsentState(autoAccepted ? true : storedConsent);
        setIsMounted(true);
        const isFirstVisit = storedConsent === null && !autoAccepted;
        if (isFirstVisit || !policyDate)
            return;
        const storedDateRaw = getCookie(dateCookieName);
        if (!storedDateRaw) {
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
            return;
        }
        const storedDate = new Date(storedDateRaw);
        setPrivacyPolicyUpdated(!Number.isNaN(storedDate.getTime()) && storedDate < policyDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const setConsent = useCallback((value) => {
        setCookie({ name: consentCookieName, value, maxAge });
        if (policyDate)
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setConsentState(value);
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const acknowledgePrivacyPolicyUpdate = useCallback(() => {
        if (policyDate)
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Visiting the privacy-policy page itself counts as having seen the
    // update — auto-acknowledge instead of also showing the banner there.
    // `pathname` still carries the locale prefix (e.g. `/de/privacy-policy`),
    // so match on a trailing segment rather than strict equality.
    useEffect(() => {
        if (privacyPolicyUpdated && privacyPolicyPath !== false && pathname.endsWith(privacyPolicyPath)) {
            acknowledgePrivacyPolicyUpdate();
        }
    }, [pathname, privacyPolicyUpdated, privacyPolicyPath, acknowledgePrivacyPolicyUpdate]);
    const contextValue = useMemo(() => ({ consent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath }), [consent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath]);
    return (_jsx(CookieConsentContext.Provider, { value: contextValue, children: children }));
}
