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
    skipAuthProvider?: boolean;
    analyticsConfig?: CookieConsentAnalyticsConfig;
    autoAnalyticsEventsConfig?: AutoAnalyticsEventsConfig;
    requiresConsent?: boolean;
    autoWireDialogs?: boolean;
    dialogProps?: CookieConsentDialogProps;
    updateDialogProps?: PrivacyPolicyUpdateDialogProps;
    children: React.ReactNode;
}): Component;
export {};
