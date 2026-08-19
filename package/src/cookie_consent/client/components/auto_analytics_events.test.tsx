import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';
import AutoAnalyticsEvents from './auto_analytics_events';

let consent: boolean | null = null;
let requiresConsent = true;
let currentPath = '/';

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, requiresConsent, setConsent: vi.fn(), privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => currentPath,
}));

let webVitalsCallback: ((metric: unknown) => void) | undefined;
vi.mock('next/web-vitals', () => ({
    useReportWebVitals: (cb: (metric: unknown) => void) => {
        webVitalsCallback = cb;
    },
}));

describe('AutoAnalyticsEvents', () => {
    beforeEach(() => {
        consent = null;
        requiresConsent = true;
        currentPath = '/';
        webVitalsCallback = undefined;
        delete (window as unknown as { gtag?: unknown }).gtag;
    });

    it('renders null', () => {
        const { container } = render(<AutoAnalyticsEvents />);
        expect(container).toBeEmptyDOMElement();
    });

    it('does not send screen_view or web vitals when consent is not granted', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = false;
        requiresConsent = true;
        render(<AutoAnalyticsEvents />);
        expect(gtag).not.toHaveBeenCalled();

        webVitalsCallback?.({ name: 'LCP', value: 1200, id: '1', rating: 'good' });
        expect(gtag).not.toHaveBeenCalled();
    });

    it('sends screen_view and web vitals when consent is true', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = true;
        requiresConsent = true;
        render(<AutoAnalyticsEvents />);

        expect(gtag).toHaveBeenCalledWith('event', 'screen_view', {
            screen_name: '/',
            page_path: '/',
        });

        gtag.mockClear();
        webVitalsCallback?.({ name: 'LCP', value: 1234.4, id: '1', rating: 'good' });
        expect(gtag).toHaveBeenCalledWith('event', 'web_lcp', {
            value: 1234,
            metric_rating: 'good',
            screen_name: '/',
            page_path: '/',
        });
    });

    it('sends screen_view and web vitals when requiresConsent is false', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = null;
        requiresConsent = false;
        render(<AutoAnalyticsEvents />);

        expect(gtag).toHaveBeenCalledWith('event', 'screen_view', {
            screen_name: '/',
            page_path: '/',
        });

        gtag.mockClear();
        webVitalsCallback?.({ name: 'CLS', value: 0.1234, id: '2', rating: 'needs-improvement' });
        expect(gtag).toHaveBeenCalledWith('event', 'web_cls', {
            value: 123,
            metric_rating: 'needs-improvement',
            screen_name: '/',
            page_path: '/',
        });
    });

    it('uses getScreenName if provided in config', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = true;
        currentPath = '/dashboard/settings';

        const getScreenName = vi.fn((path: string) => `Custom ${path}`);
        render(<AutoAnalyticsEvents config={{ getScreenName }} />);

        expect(getScreenName).toHaveBeenCalledWith('/dashboard/settings');
        expect(gtag).toHaveBeenCalledWith('event', 'screen_view', {
            screen_name: 'Custom /dashboard/settings',
            page_path: '/dashboard/settings',
        });
    });

    it('respects the events whitelist in config', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = true;

        render(<AutoAnalyticsEvents config={{ events: ['web_lcp'] }} />);
        expect(gtag).not.toHaveBeenCalledWith('event', 'screen_view', expect.anything());

        webVitalsCallback?.({ name: 'FCP', value: 500, id: '3', rating: 'good' });
        expect(gtag).not.toHaveBeenCalledWith('event', 'web_fcp', expect.anything());

        webVitalsCallback?.({ name: 'LCP', value: 1500, id: '4', rating: 'good' });
        expect(gtag).toHaveBeenCalledWith('event', 'web_lcp', expect.objectContaining({ value: 1500 }));
    });

    it('does not throw when window.gtag is not defined', () => {
        consent = true;
        expect(() => render(<AutoAnalyticsEvents />)).not.toThrow();
        expect(() => webVitalsCallback?.({ name: 'LCP', value: 1000, id: '5', rating: 'good' })).not.toThrow();
    });
});
