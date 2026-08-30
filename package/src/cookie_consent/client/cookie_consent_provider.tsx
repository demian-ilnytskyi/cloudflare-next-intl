'use client';

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import config from '../../config/intl_config.js';
import requireCookieConsentConfig from '../require_config.js';
import getCookie from '../../client/functions/get_cookie.js';
import setCookie from '../../client/functions/set_cookie.js';
import { cookieConsentCookieKey, privacyPolicyDateCookieKey } from '../../config/cookie_key.js';
import type { ConsentValue, CookieConsentContextType } from '../types.js';

export const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

function parseConsent(raw: string | null): ConsentValue {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
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
export default function CookieConsentProvider({ requiresConsent = true, children }: {
    requiresConsent?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    const { consentCookieName, dateCookieName, maxAge, policyDate, privacyPolicyPath, showPrivacyPolicy } = useMemo(() => {
        const cc = requireCookieConsentConfig(config.cookieConsent);
        return {
            consentCookieName: cc.consentCookieName ?? cookieConsentCookieKey,
            dateCookieName: cc.privacyPolicyDateCookieName ?? privacyPolicyDateCookieKey,
            maxAge: cc.cookieMaxAge ?? 31536000,
            policyDate: cc.privacyPolicyDate ? new Date(cc.privacyPolicyDate) : null,
            privacyPolicyPath: cc.privacyPolicyPath ?? '/privacy-policy',
            showPrivacyPolicy: cc.showPrivacyPolicy ?? true,
        };
         
    }, []);

    const [consent, setConsentState] = useState<ConsentValue>(null);
    const [privacyPolicyUpdated, setPrivacyPolicyUpdated] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        // `consent` reflects only what the visitor actually decided — never
        // auto-set to `true` just because `requiresConsent` is `false`.
        // Whether the banner shows / analytics unlock for a not-required
        // visitor is `requiresConsent`'s job (see `CookieConsentDialog`/
        // `CookieConsentAnalytics`), not something baked into `consent`
        // itself; otherwise there's no way to tell "not required" apart
        // from "explicitly accepted" (e.g. the settings button in the nav
        // bar, which only renders once consent has been decided).
        const rawConsent = getCookie(consentCookieName);
        const storedConsent = parseConsent(rawConsent);
        const isFirstVisit = rawConsent === null;
        setConsentState(storedConsent);
        setIsMounted(true);

        if (isFirstVisit || !policyDate) return;

        const storedDateRaw = getCookie(dateCookieName);
        if (!storedDateRaw) {
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
            return;
        }

        const storedDate = new Date(storedDateRaw);
        setPrivacyPolicyUpdated(!Number.isNaN(storedDate.getTime()) && storedDate < policyDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // `value: null` stores the literal string `'null'` (rather than clearing
    // the cookie) so the mount effect above can tell "explicitly reset" apart
    // from "no cookie yet" and skip auto-accept accordingly.
    const setConsent = useCallback((value: ConsentValue) => {
        if (value === null) {
            setCookie({ name: consentCookieName, value: 'null', maxAge });
        } else {
            setCookie({ name: consentCookieName, value, maxAge });
            if (policyDate) setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        }
        setConsentState(value);
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const acknowledgePrivacyPolicyUpdate = useCallback(() => {
        if (policyDate) setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Visiting the privacy-policy page itself counts as having seen the
    // update — auto-acknowledge instead of also showing the banner there.
    // `pathname` still carries the locale prefix (e.g. `/de/privacy-policy`),
    // so match on a trailing segment rather than strict equality.
    useEffect(() => {
        if (privacyPolicyUpdated && privacyPolicyPath !== false && pathname?.endsWith(privacyPolicyPath)) {
            acknowledgePrivacyPolicyUpdate();
        }
    }, [pathname, privacyPolicyUpdated, privacyPolicyPath, acknowledgePrivacyPolicyUpdate]);

    const contextValue = useMemo(
        () => ({ consent, requiresConsent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy }),
        [consent, requiresConsent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy],
    );

    return (
        <CookieConsentContext.Provider value={contextValue}>
            {children}
        </CookieConsentContext.Provider>
    );
}
