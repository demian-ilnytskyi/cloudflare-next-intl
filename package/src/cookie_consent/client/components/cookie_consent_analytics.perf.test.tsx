import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

let consent: boolean | null = true;
let requiresConsent = true;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, requiresConsent, setConsent: vi.fn(), privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn() }),
}));

beforeEach(() => {
    consent = true;
    requiresConsent = true;
});

afterEach(() => {
    vi.resetModules();
});

describe('CookieConsentAnalytics perf characteristics', () => {
    it('does not touch window.gtag when consent stays undecided across re-renders', () => {
        consent = null;
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;

        return import('./cookie_consent_analytics.js').then(({ default: CookieConsentAnalytics }) => {
            const { rerender } = render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
            for (let i = 0; i < 10; i++) {
                rerender(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
            }
            expect(gtag).not.toHaveBeenCalled();
            delete (window as unknown as { gtag?: unknown }).gtag;
        });
    });
});
