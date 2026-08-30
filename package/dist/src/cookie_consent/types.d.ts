export type ConsentValue = boolean | null;
export interface CookieConsentContextType {
    consent: ConsentValue;
    requiresConsent: boolean;
    isMounted: boolean;
    privacyPolicyUpdated: boolean;
    setConsent: (value: ConsentValue) => void;
    acknowledgePrivacyPolicyUpdate: () => void;
    privacyPolicyPath: string | false;
    showPrivacyPolicy: boolean;
}
export interface CookieDialogClassNames {
    root?: string;
    message?: string;
    link?: string;
    actions?: string;
    acceptButton?: string;
    declineButton?: string;
    closeButton?: string;
}
export interface CookieDialogStyles {
    root?: React.CSSProperties;
    message?: React.CSSProperties;
    link?: React.CSSProperties;
    actions?: React.CSSProperties;
    acceptButton?: React.CSSProperties;
    declineButton?: React.CSSProperties;
    closeButton?: React.CSSProperties;
}
