"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic.js";
import useLazyWrappingProvider from "./use_lazy_wrapping_provider.js";
import config from "@intl-config";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override.js";
export const LocaleContext = createContext(undefined);
const loadCookieConsentProvider = () => import("../../cookie_consent/client/cookie_consent_provider.js");
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics.js"));
const AutoAnalyticsEvents = dynamic(() => import("../../cookie_consent/client/components/auto_analytics_events.js"));
const CookieConsentDialog = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_dialog.js"));
const PrivacyPolicyUpdateDialog = dynamic(() => import("../../cookie_consent/client/components/privacy_policy_update_dialog.js"));
export default function LocationzationClientProvider({ language, messages, analyticsConfig, autoAnalyticsEventsConfig, requiresConsent = true, autoWireDialogs = true, dialogProps, updateDialogProps, children }) {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);
    installConsoleErrorOverride(config, true);
    installGlobalErrorOverride(config);
    const { Provider: CookieConsentProvider, isReady: cookieConsentReady } = useLazyWrappingProvider(loadCookieConsentProvider);
    let providedChildren = children;
    if (config.cookieConsent) {
        providedChildren = _jsxs(CookieConsentProvider, { requiresConsent: requiresConsent, children: [providedChildren, cookieConsentReady && analyticsConfig && _jsx(CookieConsentAnalytics, { config: analyticsConfig }), cookieConsentReady && analyticsConfig && (analyticsConfig.googleAnalyticsId || analyticsConfig.googleAdsId) && _jsx(AutoAnalyticsEvents, { config: autoAnalyticsEventsConfig }), cookieConsentReady && autoWireDialogs && _jsx(CookieConsentDialog, { ...dialogProps }), cookieConsentReady && autoWireDialogs && _jsx(PrivacyPolicyUpdateDialog, { ...updateDialogProps })] });
    }
    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);
    return _jsx(LocaleContext.Provider, { value: contextValue, children: providedChildren });
}
