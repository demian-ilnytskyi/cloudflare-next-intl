"use client";

import type { TranslationObject } from "../../types/types.js";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic.js";
import useLazyWrappingProvider from "./use_lazy_wrapping_provider.js";
import config from "@intl-config";
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

// `output: 'export'`-safe: unlike `client_provider.tsx`, this file has no
// import anywhere in it pointing at `firebase_auth/client/auth_user_provider`
// (which itself pulls in the "use server" `clear_session_action`). Next's
// server-actions build step registers a "use server" file the moment any
// `import()` in the compiled module graph points to it, so removing the
// import entirely — not just skipping its use at runtime — is what keeps
// `output: 'export'` builds from failing. See `server_provider_static.tsx`
// for the full explanation.
// CookieConsentProvider WRAPS `children` below. `next/dynamic`'s `loading`
// placeholder has no access to `children` (only isLoading/error/retry), so
// it would unmount the whole tree while its chunk downloads, painting a
// white screen on slow connections. `useLazyWrappingProvider` (used in the
// component body) always renders `children` and only adds the provider
// wrapper once its chunk has resolved.
const loadCookieConsentProvider = () => import("../../cookie_consent/client/cookie_consent_provider.js");
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics.js"));
const AutoAnalyticsEvents = dynamic(() => import("../../cookie_consent/client/components/auto_analytics_events.js"));
const CookieConsentDialog = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_dialog.js"));
const PrivacyPolicyUpdateDialog = dynamic(() => import("../../cookie_consent/client/components/privacy_policy_update_dialog.js"));

export default function LocationzationClientProvider({
    language,
    messages,
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

    const { Provider: CookieConsentProvider, isReady: cookieConsentReady } = useLazyWrappingProvider(loadCookieConsentProvider);

    let providedChildren = children;
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
