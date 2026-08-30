'use client';
import { useContext } from 'react';
import { CookieConsentContext } from './cookie_consent_provider.js';
export default function useCookieConsent() {
    const context = useContext(CookieConsentContext);
    if (context === null) {
        throw new Error('useCookieConsent must be used within a CookieConsentProvider');
    }
    return context;
}
