"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override.js";
export const LocaleContext = createContext(undefined);
// Hoisted to module scope — calling `dynamic()` inside the component body
// creates a brand-new component identity every render, forcing React to
// unmount/remount `AuthUserProvider` on every render instead of reusing the
// existing instance. That remount re-subscribes `onIdTokenChanged`, which
// Firebase immediately replays with the current user, triggering a state
// update (and a `getIdToken(true)` refresh) that causes another render —
// an infinite loop of session-cookie writes, one per render.
const AuthUserProvider = dynamic(() => import("../../firebase_auth/client/auth_user_provider.js"));
const AutoFirebasePerformanceEvents = dynamic(() => import("../../firebase_auth/client/components/auto_firebase_performance_events.js"));
const CookieConsentProvider = dynamic(() => import("../../cookie_consent/client/cookie_consent_provider.js"));
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics.js"));
const AutoAnalyticsEvents = dynamic(() => import("../../cookie_consent/client/components/auto_analytics_events.js"));
const CookieConsentDialog = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_dialog.js"));
const PrivacyPolicyUpdateDialog = dynamic(() => import("../../cookie_consent/client/components/privacy_policy_update_dialog.js"));
export default function LocationzationClientProvider({ language, messages, initialAuthUser = null, skipAuthProvider = false, analyticsConfig, autoAnalyticsEventsConfig, requiresConsent = true, autoWireDialogs = true, dialogProps, updateDialogProps, children }) {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);
    installConsoleErrorOverride(config, true);
    installGlobalErrorOverride(config);
    // `LocaleContext.Provider` stays the outermost element here — the
    // client `AuthUserProvider` (and its descendants calling
    // usePathname()/useLocale()) must render as a CHILD of it, not a
    // sibling wrapping it, or those hooks would throw for running outside
    // the provider.
    let providedChildren = children;
    if (config.firebaseAuth && !skipAuthProvider) {
        providedChildren = _jsxs(AuthUserProvider, { initialUser: initialAuthUser, children: [children, config.firebaseAuth.performance !== false && _jsx(AutoFirebasePerformanceEvents, {})] });
    }
    if (config.cookieConsent) {
        providedChildren = _jsxs(CookieConsentProvider, { requiresConsent: requiresConsent, children: [providedChildren, analyticsConfig && _jsx(CookieConsentAnalytics, { config: analyticsConfig }), analyticsConfig && (analyticsConfig.googleAnalyticsId || analyticsConfig.googleAdsId) && _jsx(AutoAnalyticsEvents, { config: autoAnalyticsEventsConfig }), autoWireDialogs && _jsx(CookieConsentDialog, { ...dialogProps }), autoWireDialogs && _jsx(PrivacyPolicyUpdateDialog, { ...updateDialogProps })] });
    }
    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);
    return _jsx(LocaleContext.Provider, { value: contextValue, children: providedChildren });
}
