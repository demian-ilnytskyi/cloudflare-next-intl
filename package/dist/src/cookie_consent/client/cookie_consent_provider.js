'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import config from '../../config/intl_config.js';
import requireCookieConsentConfig from '../require_config.js';
import getCookie from '../../client/functions/get_cookie.js';
import setCookie from '../../client/functions/set_cookie.js';
import { cookieConsentCookieKey, privacyPolicyDateCookieKey } from '../../config/cookie_key.js';
export const CookieConsentContext = createContext(null);
function parseConsent(raw) {
    if (raw === 'true')
        return true;
    if (raw === 'false')
        return false;
    return null;
}
export default function CookieConsentProvider({ requiresConsent = true, children }) {
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
    const [consent, setConsentState] = useState(null);
    const [privacyPolicyUpdated, setPrivacyPolicyUpdated] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const pathname = usePathname();
    useEffect(() => {
        const rawConsent = getCookie(consentCookieName);
        const storedConsent = parseConsent(rawConsent);
        const isFirstVisit = rawConsent === null;
        setConsentState(storedConsent);
        setIsMounted(true);
        if (isFirstVisit || !policyDate)
            return;
        const storedDateRaw = getCookie(dateCookieName);
        if (!storedDateRaw) {
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
            return;
        }
        const storedDate = new Date(storedDateRaw);
        setPrivacyPolicyUpdated(!Number.isNaN(storedDate.getTime()) && storedDate < policyDate);
    }, []);
    const setConsent = useCallback((value) => {
        if (value === null) {
            setCookie({ name: consentCookieName, value: 'null', maxAge });
        }
        else {
            setCookie({ name: consentCookieName, value, maxAge });
            if (policyDate)
                setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        }
        setConsentState(value);
        setPrivacyPolicyUpdated(false);
    }, []);
    const acknowledgePrivacyPolicyUpdate = useCallback(() => {
        if (policyDate)
            setCookie({ name: dateCookieName, value: policyDate.toISOString(), maxAge });
        setPrivacyPolicyUpdated(false);
    }, []);
    useEffect(() => {
        if (privacyPolicyUpdated && privacyPolicyPath !== false && pathname?.endsWith(privacyPolicyPath)) {
            acknowledgePrivacyPolicyUpdate();
        }
    }, [pathname, privacyPolicyUpdated, privacyPolicyPath, acknowledgePrivacyPolicyUpdate]);
    const contextValue = useMemo(() => ({ consent, requiresConsent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy }), [consent, requiresConsent, privacyPolicyUpdated, isMounted, setConsent, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy]);
    return (_jsx(CookieConsentContext.Provider, { value: contextValue, children: children }));
}
