/** Consent value: `true` accepted, `false` necessary-only, `null` not yet decided. */
export type ConsentValue = boolean | null;

/** Context value returned by `useCookieConsent()`. */
export interface CookieConsentContextType {
    /** Current consent value; `null` until the visitor decides. */
    consent: ConsentValue;
    /**
     * `true` once a privacy-policy update has been detected (stored consent
     * predates `cookieConsent.privacyPolicyDate`) and hasn't been
     * acknowledged yet. Always `false` when `privacyPolicyDate` is unset.
     */
    privacyPolicyUpdated: boolean;
    /** Accepts (or rejects, with `false`) cookie consent and persists it. */
    setConsent: (value: boolean) => void;
    /** Acknowledges the privacy-policy update banner and persists the new date. */
    acknowledgePrivacyPolicyUpdate: () => void;
    /**
     * Resolved from `cookieConsent.privacyPolicyPath` (defaults to
     * `'/privacy-policy'`; `false` disables it). Used by the default
     * dialog components to render a privacy-policy link automatically
     * when their `link` prop is omitted.
     */
    privacyPolicyPath: string | false;
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
