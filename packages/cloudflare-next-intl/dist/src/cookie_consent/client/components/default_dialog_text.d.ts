export interface CookieConsentDefaultText {
    message: string;
    privacyPolicyLinkText: string;
    acceptText: string;
    declineText: string;
}
export interface PrivacyPolicyUpdateDefaultText {
    message: string;
    privacyPolicyLinkText: string;
    closeText: string;
}
export declare const defaultCookieConsentText: Record<string, CookieConsentDefaultText>;
export declare const defaultPrivacyPolicyUpdateText: Record<string, PrivacyPolicyUpdateDefaultText>;
