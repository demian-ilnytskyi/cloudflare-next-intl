import type { CookieConsentContextType } from '../types.js';
export declare const CookieConsentContext: import("react").Context<CookieConsentContextType | null>;
export default function CookieConsentProvider({ requiresConsent, children }: {
    requiresConsent?: boolean;
    children: React.ReactNode;
}): React.ReactElement;
