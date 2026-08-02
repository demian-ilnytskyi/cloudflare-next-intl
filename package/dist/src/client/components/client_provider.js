"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
export const LocaleContext = createContext(undefined);
// Hoisted to module scope — calling `dynamic()` inside the component body
// creates a brand-new component identity every render, forcing React to
// unmount/remount `AuthUserProvider` on every render instead of reusing the
// existing instance. That remount re-subscribes `onIdTokenChanged`, which
// Firebase immediately replays with the current user, triggering a state
// update (and a `getIdToken(true)` refresh) that causes another render —
// an infinite loop of session-cookie writes, one per render.
const AuthUserProvider = dynamic(() => import("../../firebase_auth/client/auth_user_provider"));
const CookieConsentProvider = dynamic(() => import("../../cookie_consent/client/cookie_consent_provider"));
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics"));
export default function LocationzationClientProvider({ language, messages, initialAuthUser = null, skipAuthProvider = false, analyticsSecrets, requiresConsent = true, children }) {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);
    // `LocaleContext.Provider` stays the outermost element here — the
    // client `AuthUserProvider` (and its descendants calling
    // usePathname()/useLocale()) must render as a CHILD of it, not a
    // sibling wrapping it, or those hooks would throw for running outside
    // the provider.
    let providedChildren = children;
    if (config.firebaseAuth && !skipAuthProvider) {
        providedChildren = _jsx(AuthUserProvider, { initialUser: initialAuthUser, children: children });
    }
    if (config.cookieConsent) {
        providedChildren = _jsxs(CookieConsentProvider, { requiresConsent: requiresConsent, children: [providedChildren, analyticsSecrets && _jsx(CookieConsentAnalytics, { secrets: analyticsSecrets })] });
    }
    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);
    return _jsx(LocaleContext.Provider, { value: contextValue, children: providedChildren });
}
