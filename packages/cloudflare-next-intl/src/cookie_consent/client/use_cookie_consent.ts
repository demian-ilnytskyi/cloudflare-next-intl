'use client';

import { useContext } from 'react';
import { CookieConsentContext } from './cookie_consent_provider.js';
import type { CookieConsentContextType } from '../types.js';

/**
 * Reads cookie-consent + privacy-policy-update state. Must be called within
 * a `CookieConsentProvider`.
 */
export default function useCookieConsent(): CookieConsentContextType {
    const context = useContext(CookieConsentContext);
    if (context === null) {
        throw new Error('useCookieConsent must be used within a CookieConsentProvider');
    }
    return context;
}
