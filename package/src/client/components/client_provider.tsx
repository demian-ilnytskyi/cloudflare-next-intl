"use client";

import type { TranslationObject } from "../../types/types.js";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
import type { SerializedAuthUser } from "../../firebase_auth/types.js";
import type { CookieConsentAnalyticsConfig, AutoAnalyticsEventsConfig } from "../../types/types.js";
import type { CookieConsentDialogProps } from "../../cookie_consent/client/components/cookie_consent_dialog.js";
import type { PrivacyPolicyUpdateDialogProps } from "../../cookie_consent/client/components/privacy_policy_update_dialog.js";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override.js";

interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

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

export default function LocationzationClientProvider({
    language,
    messages,
    initialAuthUser = null,
    skipAuthProvider = false,
    analyticsConfig,
    autoAnalyticsEventsConfig,
    requiresConsent = true,
    autoWireDialogs = true,
    dialogProps,
    updateDialogProps,
    children
}: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    /** Set when `firebaseAuth.autoWireClientProvider` is `false` — skips wrapping `children` in the client `AuthUserProvider` entirely. */
    skipAuthProvider?: boolean;
    /** Resolved server-side from `cookieConsent.analytics`/`getAnalytics` when `autoWireAnalytics` isn't `false`. */
    analyticsConfig?: CookieConsentAnalyticsConfig;
    /** From `cookieConsent.autoAnalyticsEvents` — forwarded as-is to the auto-wired `AutoAnalyticsEvents`. */
    autoAnalyticsEventsConfig?: AutoAnalyticsEventsConfig;
    /**
     * Resolved server-side from `cookieConsent.getCountryCode`/`gdprCountries`.
     * `false` means the visitor's country doesn't require the consent
     * banner — `CookieConsentProvider` seeds consent as implicitly granted
     * for a first-time visitor instead of `null`.
     */
    requiresConsent?: boolean;
    /** From `cookieConsent.autoWireDialogs` — renders `CookieConsentDialog`/`PrivacyPolicyUpdateDialog` automatically when `true` (default). */
    autoWireDialogs?: boolean;
    /** From `cookieConsent.dialogProps` — forwarded as-is to the auto-wired `CookieConsentDialog`. */
    dialogProps?: CookieConsentDialogProps;
    /** From `cookieConsent.updateDialogProps` — forwarded as-is to the auto-wired `PrivacyPolicyUpdateDialog`. */
    updateDialogProps?: PrivacyPolicyUpdateDialogProps;
    children: React.ReactNode;
}): Component {
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
        providedChildren = <AuthUserProvider initialUser={initialAuthUser}>
            {children}
            {config.firebaseAuth.performance !== false && <AutoFirebasePerformanceEvents />}
        </AuthUserProvider>;
    }
    if (config.cookieConsent) {
        providedChildren = <CookieConsentProvider requiresConsent={requiresConsent}>
            {providedChildren}
            {analyticsConfig && <CookieConsentAnalytics config={analyticsConfig} />}
            {analyticsConfig && (analyticsConfig.googleAnalyticsId || analyticsConfig.googleAdsId) && <AutoAnalyticsEvents config={autoAnalyticsEventsConfig} />}
            {autoWireDialogs && <CookieConsentDialog {...dialogProps} />}
            {autoWireDialogs && <PrivacyPolicyUpdateDialog {...updateDialogProps} />}
        </CookieConsentProvider>;
    }

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return <LocaleContext.Provider value={contextValue}>
        {providedChildren}
    </LocaleContext.Provider>;
}
