'use client';

import { createContext, useCallback, useEffect, useState } from 'react';
import config from '../../config/intl_config';
import requireCookieConsentConfig from '../require_config';
import getCookie from '../../client/functions/get_cookie';
import setCookie from '../../client/functions/set_cookie';
import { cookieConsentCookieKey, privacyPolicyDateCookieKey } from '../../config/cookie_key';
import type { ConsentValue, CookieConsentContextType } from '../types';

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
 * `acknowledgePrivacyPolicyUpdate()`.
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
export default function CookieConsentProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const cc = requireCookieConsentConfig(config.cookieConsent);

    const consentCookieName = cc.consentCookieName ?? cookieConsentCookieKey;
    const dateCookieName = cc.privacyPolicyDateCookieName ?? privacyPolicyDateCookieKey;
    const maxAge = cc.cookieMaxAge ?? 31536000;
    const policyDate = cc.privacyPolicyDate ? new Date(cc.privacyPolicyDate) : null;

    const [consent, setConsentState] = useState<ConsentValue>(null);
    const [privacyPolicyUpdated, setPrivacyPolicyUpdated] = useState(false);

    useEffect(() => {
        const storedConsent = parseConsent(getCookie(consentCookieName));
        setConsentState(storedConsent);

        if (storedConsent === null || !policyDate) return;

        const storedDateRaw = getCookie(dateCookieName);
        if (!storedDateRaw) {
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
            return;
        }

        const storedDate = new Date(storedDateRaw);
        setPrivacyPolicyUpdated(!Number.isNaN(storedDate.getTime()) && storedDate < policyDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setConsent = useCallback((value: boolean) => {
        setCookie({ name: consentCookieName, value, maxAge });
        if (policyDate) setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setConsentState(value);
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const acknowledgePrivacyPolicyUpdate = useCallback(() => {
        if (policyDate) setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setPrivacyPolicyUpdated(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <CookieConsentContext.Provider
            value={{ consent, privacyPolicyUpdated, setConsent, acknowledgePrivacyPolicyUpdate }}>
            {children}
        </CookieConsentContext.Provider>
    );
}
