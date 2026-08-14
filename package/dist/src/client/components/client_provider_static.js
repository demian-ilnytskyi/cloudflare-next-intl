"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override";
export const LocaleContext = createContext(undefined);
// `output: 'export'`-safe: unlike `client_provider.tsx`, this file has no
// import anywhere in it pointing at `firebase_auth/client/auth_user_provider`
// (which itself pulls in the "use server" `clear_session_action`). Next's
// server-actions build step registers a "use server" file the moment any
// `import()` in the compiled module graph points to it, so removing the
// import entirely — not just skipping its use at runtime — is what keeps
// `output: 'export'` builds from failing. See `server_provider_static.tsx`
// for the full explanation.
const CookieConsentProvider = dynamic(() => import("../../cookie_consent/client/cookie_consent_provider"));
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics"));
const CookieConsentDialog = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_dialog"));
const PrivacyPolicyUpdateDialog = dynamic(() => import("../../cookie_consent/client/components/privacy_policy_update_dialog"));
export default function LocationzationClientProvider({ language, messages, analyticsConfig, requiresConsent = true, autoWireDialogs = true, dialogProps, updateDialogProps, children }) {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);
    installConsoleErrorOverride(config, true);
    installGlobalErrorOverride(config);
    let providedChildren = children;
    if (config.cookieConsent) {
        providedChildren = _jsxs(CookieConsentProvider, { requiresConsent: requiresConsent, children: [providedChildren, analyticsConfig && _jsx(CookieConsentAnalytics, { config: analyticsConfig }), autoWireDialogs && _jsx(CookieConsentDialog, { ...dialogProps }), autoWireDialogs && _jsx(PrivacyPolicyUpdateDialog, { ...updateDialogProps })] });
    }
    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);
    return _jsx(LocaleContext.Provider, { value: contextValue, children: providedChildren });
}
