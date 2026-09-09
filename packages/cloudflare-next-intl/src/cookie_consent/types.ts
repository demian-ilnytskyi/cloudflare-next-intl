/** Consent value: `true` accepted, `false` necessary-only, `null` not yet decided. */
export type ConsentValue = boolean | null;

/** Context value returned by `useCookieConsent()`. */
export interface CookieConsentContextType {
    /** Current consent value; `null` until the visitor decides. */
    consent: ConsentValue;
    /**
     * Resolved server-side from `cookieConsent.getCountryCode`/
     * `gdprCountries` (see `resolveRequiresConsent`). `false` means the
     * visitor's country doesn't require consent at all — the default
     * `CookieConsentDialog` stays hidden and `CookieConsentAnalytics`
     * unlocks immediately, even while `consent` itself is still `null`
     * (never decided, since there was nothing to decide).
     */
    requiresConsent: boolean;
    /**
     * `false` until the client has read the stored consent/date cookies once
     * (always `false` during SSR and the first client render, to avoid a
     * hydration mismatch). The default dialog components render nothing
     * until this is `true`, so a returning visitor's decided consent never
     * flashes the banner before disappearing.
     */
    isMounted: boolean;
    /**
     * `true` once a privacy-policy update has been detected (stored consent
     * predates `cookieConsent.privacyPolicyDate`) and hasn't been
     * acknowledged yet. Always `false` when `privacyPolicyDate` is unset.
     */
    privacyPolicyUpdated: boolean;
    /**
     * Accepts (or rejects, with `false`) cookie consent and persists it.
     * Pass `null` to clear the stored decision and reset `consent` back to
     * `null`, so the default `CookieConsentDialog` banner reappears (e.g.
     * for a "cookie settings" button).
     */
    setConsent: (value: ConsentValue) => void;
    /** Acknowledges the privacy-policy update banner and persists the new date. */
    acknowledgePrivacyPolicyUpdate: () => void;
    /**
     * Resolved from `cookieConsent.privacyPolicyPath` (defaults to
     * `'/privacy-policy'`; `false` disables it). Used by the default
     * dialog components to render a privacy-policy link automatically
     * when their `link` prop is omitted.
     */
    privacyPolicyPath: string | false;
    /**
     * Whether the privacy policy link should be shown in default dialogs.
     * Defaults to `true`.
     */
    showPrivacyPolicy: boolean;
}

/** Slot-level style/class overrides accepted by the default dialog components. */
export interface CookieDialogClassNames {
    root?: string;
    message?: string;
    link?: string;
    actions?: string;
    acceptButton?: string;
    declineButton?: string;
    closeButton?: string;
}

/** Slot-level inline-style overrides accepted by the default dialog components. */
export interface CookieDialogStyles {
    root?: React.CSSProperties;
    message?: React.CSSProperties;
    link?: React.CSSProperties;
    actions?: React.CSSProperties;
    acceptButton?: React.CSSProperties;
    declineButton?: React.CSSProperties;
    closeButton?: React.CSSProperties;
}
