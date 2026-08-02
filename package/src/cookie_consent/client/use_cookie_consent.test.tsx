import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import useCookieConsent from './use_cookie_consent';
import { CookieConsentContext } from './cookie_consent_provider';

function Consumer() {
    const ctx = useCookieConsent();
    return <span>{ctx.consent === null ? 'undecided' : String(ctx.consent)}</span>;
}

describe('useCookieConsent', () => {
    it('throws when rendered outside a provider', () => {
        expect(() => render(<Consumer />)).toThrow('useCookieConsent must be used within a CookieConsentProvider');
    });

    it('returns the value provided by CookieConsentContext.Provider', () => {
        render(
            <CookieConsentContext.Provider
                value={{
                    consent: true,
                    privacyPolicyUpdated: false,
                    setConsent: () => {},
                    acknowledgePrivacyPolicyUpdate: () => {},
                }}
            >
                <Consumer />
            </CookieConsentContext.Provider>,
        );
        expect(screen.getByText('true')).toBeInTheDocument();
    });
});
