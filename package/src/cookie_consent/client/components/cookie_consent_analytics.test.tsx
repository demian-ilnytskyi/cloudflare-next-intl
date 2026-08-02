import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import CookieConsentAnalytics from './cookie_consent_analytics';

let consent: boolean | null = null;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, setConsent: vi.fn(), privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn() }),
}));

vi.mock('next/dynamic', () => ({
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
        return function DynamicWrapper(props: Record<string, unknown>) {
            const [Comp, setComp] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null);
            React.useEffect(() => {
                loader().then((m) => setComp(() => m.default));
            }, []);
            if (!Comp) return null;
            const C = Comp;
            return <C {...props} />;
        };
    },
}));

const clarityInit = vi.fn();
const clarityConsent = vi.fn();
vi.mock('./clarity_script', () => ({
    default: ({ projectId }: { projectId: string }) => {
        React.useEffect(() => {
            clarityInit(projectId);
            clarityConsent();
        }, [projectId]);
        return null;
    },
}));

describe('CookieConsentAnalytics', () => {
    beforeEach(() => {
        consent = null;
        clarityInit.mockClear();
        clarityConsent.mockClear();
        delete (window as unknown as { gtag?: unknown }).gtag;
    });

    afterEach(() => {
        delete (window as unknown as { gtag?: unknown }).gtag;
    });

    it('renders nothing when no analytics config is provided', () => {
        const { container } = render(<CookieConsentAnalytics config={{}} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the Google Consent Mode bootstrap script when any google id is set', () => {
        const { container } = render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
        expect(container.querySelector('#cookie-consent-google-consent-mode')).toBeInTheDocument();
    });

    it('includes config calls and the gtag loader for googleAdsId and adsense loader for googleAdSenseId', () => {
        const { container } = render(
            <CookieConsentAnalytics
                config={{ googleAnalyticsId: 'G-XXX', googleAdsId: 'AW-YYY', googleAdSenseId: 'ca-pub-ZZZ' }}
            />,
        );
        const script = container.querySelector('#cookie-consent-google-consent-mode');
        expect(script?.innerHTML).toContain("gtag('config', 'G-XXX')");
        expect(script?.innerHTML).toContain("gtag('config', 'AW-YYY')");
        expect(script?.innerHTML).toContain('id=G-XXX');
        expect(script?.innerHTML).toContain('client=ca-pub-ZZZ');
    });

    it('uses googleAdsId for the gtag loader src when googleAnalyticsId is absent', () => {
        const { container } = render(<CookieConsentAnalytics config={{ googleAdsId: 'AW-YYY' }} />);
        const script = container.querySelector('#cookie-consent-google-consent-mode');
        expect(script?.innerHTML).toContain('id=AW-YYY');
        expect(script?.innerHTML).toContain("gtag('config', 'AW-YYY')");
    });

    it('omits the gtag loader entirely when only googleAdSenseId is set', () => {
        const { container } = render(<CookieConsentAnalytics config={{ googleAdSenseId: 'ca-pub-ZZZ' }} />);
        const script = container.querySelector('#cookie-consent-google-consent-mode');
        expect(script?.innerHTML).not.toContain('googletagmanager.com/gtag/js');
        expect(script?.innerHTML).toContain('client=ca-pub-ZZZ');
    });

    it('omits the adsense loader when googleAdSenseId is unset', () => {
        const { container } = render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
        const script = container.querySelector('#cookie-consent-google-consent-mode');
        expect(script?.innerHTML).not.toContain('adsbygoogle.js');
    });

    it('does not render the cloudflare beacon or clarity scripts before consent is granted', () => {
        consent = false;
        const { container } = render(
            <CookieConsentAnalytics config={{ cloudflareBeaconToken: '{"token":"abc"}', clarityProjectId: 'proj' }} />,
        );
        expect(container.querySelector('script[data-cf-beacon]')).not.toBeInTheDocument();
        expect(clarityInit).not.toHaveBeenCalled();
    });

    it('renders the cloudflare beacon script once consent is granted', () => {
        consent = true;
        const { container } = render(<CookieConsentAnalytics config={{ cloudflareBeaconToken: '{"token":"abc"}' }} />);
        const script = container.querySelector('script[data-cf-beacon]');
        expect(script).toBeInTheDocument();
        expect(script).toHaveAttribute('data-cf-beacon', '{"token":"abc"}');
    });

    it('loads and initializes clarity once consent is granted', async () => {
        consent = true;
        render(<CookieConsentAnalytics config={{ clarityProjectId: 'proj-123' }} />);
        await waitFor(() => expect(clarityInit).toHaveBeenCalledWith('proj-123'));
        expect(clarityConsent).toHaveBeenCalled();
    });

    it('does not call gtag update while consent is undecided', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = null;
        render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
        expect(gtag).not.toHaveBeenCalled();
    });

    it('skips the gtag update when window.gtag is not a function', () => {
        consent = true;
        expect(() => render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />)).not.toThrow();
    });

    it('sends granted consent state to gtag once consent is true', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = true;
        render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
        expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ ad_storage: 'granted' }));
    });

    it('sends denied consent state to gtag once consent is false', () => {
        const gtag = vi.fn();
        (window as unknown as { gtag: typeof gtag }).gtag = gtag;
        consent = false;
        render(<CookieConsentAnalytics config={{ googleAnalyticsId: 'G-XXX' }} />);
        expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ ad_storage: 'denied' }));
    });
});
