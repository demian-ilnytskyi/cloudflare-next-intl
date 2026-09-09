"use client";

import type { TranslationObject } from "../../types/types.js";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic.js";
import useLazyWrappingProvider from "./use_lazy_wrapping_provider.js";
import config from "@intl-config";
import type { SerializedAuthUser } from "../../firebase_auth/types.js";
import type { CookieConsentAnalyticsConfig, AutoAnalyticsEventsConfig } from "../../types/types.js";
import type { CookieConsentDialogProps } from "../../cookie_consent/client/components/cookie_consent_dialog.js";
import type { PrivacyPolicyUpdateDialogProps } from "../../cookie_consent/client/components/privacy_policy_update_dialog.js";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override.js";
import AuthUserPendingProvider from "../../firebase_auth/client/auth_user_pending_provider.js";

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
//
// AuthUserProvider and CookieConsentProvider both WRAP `children` further
// down. `next/dynamic`'s `loading` placeholder has no access to the
// component's `children` prop (it only ever receives isLoading/error/retry),
// so it cannot render them — the standard `dynamic()` call would unmount the
// entire app tree while the chunk downloads, painting a white screen on slow
// connections. `useLazyWrappingProvider` (below, used in the component body)
// solves this by always rendering `children` and only adding the provider
// wrapper once its chunk has resolved.
const loadAuthUserProvider = () => import("../../firebase_auth/client/auth_user_provider.js");
const AutoFirebasePerformanceEvents = dynamic(() => import("../../firebase_auth/client/components/auto_firebase_performance_events.js"));
const loadCookieConsentProvider = () => import("../../cookie_consent/client/cookie_consent_provider.js");
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
    const { Provider: AuthUserProvider } = useLazyWrappingProvider(loadAuthUserProvider);
    const { Provider: CookieConsentProvider, isReady: cookieConsentReady } = useLazyWrappingProvider(loadCookieConsentProvider);

    let providedChildren = children;
    if (config.firebaseAuth && !skipAuthProvider) {
        // `AuthUserProvider` keeps `children` mounted while its own chunk
        // downloads (see useLazyWrappingProvider), so during that window the
        // JSX nesting below is not yet a real context boundary — a child
        // calling useAuthUser() would hit the `null` default, throw, and
        // flash the error page until the chunk lands.
        // `AuthUserPendingProvider` sits OUTSIDE (so the tree shape never
        // changes on resolution) and publishes the same seed value the real
        // provider starts from; once resolved, the inner real provider
        // shadows it.
        providedChildren = <AuthUserPendingProvider initialUser={initialAuthUser}>
            <AuthUserProvider initialUser={initialAuthUser}>
                {children}
                {config.firebaseAuth.performance !== false && <AutoFirebasePerformanceEvents />}
            </AuthUserProvider>
        </AuthUserPendingProvider>;
    }
    if (config.cookieConsent) {
        // The analytics/dialog siblings below call useCookieConsent(), which
        // throws when rendered outside a live CookieConsentProvider context.
        // CookieConsentProvider keeps `providedChildren` mounted even before
        // its own chunk resolves (see useLazyWrappingProvider) — so gate
        // these siblings on `cookieConsentReady` rather than just on JSX
        // nesting, or they would crash during that pending window.
        providedChildren = <CookieConsentProvider requiresConsent={requiresConsent}>
            {providedChildren}
            {cookieConsentReady && analyticsConfig && <CookieConsentAnalytics config={analyticsConfig} />}
            {cookieConsentReady && analyticsConfig && (analyticsConfig.googleAnalyticsId || analyticsConfig.googleAdsId) && <AutoAnalyticsEvents config={autoAnalyticsEventsConfig} />}
            {cookieConsentReady && autoWireDialogs && <CookieConsentDialog {...dialogProps} />}
            {cookieConsentReady && autoWireDialogs && <PrivacyPolicyUpdateDialog {...updateDialogProps} />}
        </CookieConsentProvider>;
    }

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return <LocaleContext.Provider value={contextValue}>
        {providedChildren}
    </LocaleContext.Provider>;
}
