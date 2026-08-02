import type { TranslationObject } from "../../types/types";
import type { SerializedAuthUser } from "../../firebase_auth/types";
import type { CookieConsentAnalyticsSecrets } from "../../types/types";
interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}
export declare const LocaleContext: import("react").Context<LocaleContextType | undefined>;
export default function LocationzationClientProvider({ language, messages, initialAuthUser, skipAuthProvider, analyticsSecrets, children }: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    /** Set when `firebaseAuth.autoWireClientProvider` is `false` — skips wrapping `children` in the client `AuthUserProvider` entirely. */
    skipAuthProvider?: boolean;
    /** Resolved server-side from `cookieConsent.secrets`/`getSecrets` when `autoWireAnalytics` isn't `false`. */
    analyticsSecrets?: CookieConsentAnalyticsSecrets;
    children: React.ReactNode;
}): Component;
export {};
