"use client";

import type { TranslationObject } from "../../types/types";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
import type { SerializedAuthUser } from "../../firebase_auth/types";
import type { CookieConsentAnalyticsSecrets } from "../../types/types";

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
const AuthUserProvider = dynamic(() => import("../../firebase_auth/client/auth_user_provider"));
const CookieConsentProvider = dynamic(() => import("../../cookie_consent/client/cookie_consent_provider"));
const CookieConsentAnalytics = dynamic(() => import("../../cookie_consent/client/components/cookie_consent_analytics"));

export default function LocationzationClientProvider({
    language,
    messages,
    initialAuthUser = null,
    skipAuthProvider = false,
    analyticsSecrets,
    requiresConsent = true,
    children
}: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    /** Set when `firebaseAuth.autoWireClientProvider` is `false` — skips wrapping `children` in the client `AuthUserProvider` entirely. */
    skipAuthProvider?: boolean;
    /** Resolved server-side from `cookieConsent.secrets`/`getSecrets` when `autoWireAnalytics` isn't `false`. */
    analyticsSecrets?: CookieConsentAnalyticsSecrets;
    /**
     * Resolved server-side from `cookieConsent.getCountryCode`/`gdprCountries`.
     * `false` means the visitor's country doesn't require the consent
     * banner — `CookieConsentProvider` seeds consent as implicitly granted
     * for a first-time visitor instead of `null`.
     */
    requiresConsent?: boolean;
    children: React.ReactNode;
}): Component {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);

    // `LocaleContext.Provider` stays the outermost element here — the
    // client `AuthUserProvider` (and its descendants calling
    // usePathname()/useLocale()) must render as a CHILD of it, not a
    // sibling wrapping it, or those hooks would throw for running outside
    // the provider.
    let providedChildren = children;
    if (config.firebaseAuth && !skipAuthProvider) {
        providedChildren = <AuthUserProvider initialUser={initialAuthUser}>{children}</AuthUserProvider>;
    }
    if (config.cookieConsent) {
        providedChildren = <CookieConsentProvider requiresConsent={requiresConsent}>
            {providedChildren}
            {analyticsSecrets && <CookieConsentAnalytics secrets={analyticsSecrets} />}
        </CookieConsentProvider>;
    }

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return <LocaleContext.Provider value={contextValue}>
        {providedChildren}
    </LocaleContext.Provider>;
}
