import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

let consent: boolean | null = true;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, setConsent: vi.fn(), privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn() }),
}));

const clarityInit = vi.fn();
const clarityConsent = vi.fn();
vi.mock('@microsoft/clarity', () => ({
    default: { init: clarityInit, consent: clarityConsent },
}));

beforeEach(() => {
    consent = true;
    clarityInit.mockClear();
    clarityConsent.mockClear();
});

afterEach(() => {
    vi.resetModules();
});

describe('CookieConsentAnalytics dynamic import cost', () => {
    it('caches the @microsoft/clarity module import across mounts, so repeated mounts do not re-pay the import cost', async () => {
        const { default: CookieConsentAnalytics } = await import('./cookie_consent_analytics');

        for (let i = 0; i < 5; i++) {
            const { unmount } = render(<CookieConsentAnalytics secrets={{ clarityProjectId: `proj-${i}` }} />);
            await vi.waitFor(() => expect(clarityInit).toHaveBeenCalledWith(`proj-${i}`));
            unmount();
        }

        expect(clarityInit).toHaveBeenCalledTimes(5);
    });

    it('does not touch window.gtag when consent stays undecided across re-renders', () => {
        consent = null;
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;

        return import('./cookie_consent_analytics').then(({ default: CookieConsentAnalytics }) => {
            const { rerender } = render(<CookieConsentAnalytics secrets={{ googleAnalyticsId: 'G-XXX' }} />);
            for (let i = 0; i < 10; i++) {
                rerender(<CookieConsentAnalytics secrets={{ googleAnalyticsId: 'G-XXX' }} />);
            }
            expect(gtag).not.toHaveBeenCalled();
            delete (window as unknown as { gtag?: unknown }).gtag;
        });
    });
});
