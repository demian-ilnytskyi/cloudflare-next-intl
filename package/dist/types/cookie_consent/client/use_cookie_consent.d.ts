import type { CookieConsentContextType } from '../types';
/**
 * Reads cookie-consent + privacy-policy-update state. Must be called within
 * a `CookieConsentProvider`.
 */
export default function useCookieConsent(): CookieConsentContextType;
