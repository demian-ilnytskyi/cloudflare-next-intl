import type { TranslationObject } from "../../types/types.js";
import type { SerializedAuthUser } from "../../firebase_auth/types.js";
import type { CookieConsentAnalyticsConfig, AutoAnalyticsEventsConfig } from "../../types/types.js";
import type { CookieConsentDialogProps } from "../../cookie_consent/client/components/cookie_consent_dialog.js";
import type { PrivacyPolicyUpdateDialogProps } from "../../cookie_consent/client/components/privacy_policy_update_dialog.js";
interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}
export declare const LocaleContext: import("react").Context<LocaleContextType | undefined>;
export default function LocationzationClientProvider({ language, messages, initialAuthUser, skipAuthProvider, analyticsConfig, autoAnalyticsEventsConfig, requiresConsent, autoWireDialogs, dialogProps, updateDialogProps, children }: {
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
}): Component;
export {};
