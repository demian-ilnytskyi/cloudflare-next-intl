import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../client/components/client_helper_script', () => ({ default: () => null }));

afterEach(() => {
    cleanup();
});

describe('Umbrella HelperScript', () => {
    it('computes origins from config and passes them to core HelperScript', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                defaultLocale: 'en',
                cookieConsent: {
                    analytics: {
                        googleAnalyticsId: 'G-123',
                        clarityProjectId: 'clarity-123',
                    },
                },
                firebaseAuth: {
                    appCheck: {
                        turnstileSiteKey: 'turnstile-site-key',
                    },
                },
            },
        }));

        const { default: ConfiguredHelperScript } = await import('./helper_script.js');
        render(<ConfiguredHelperScript locale="en" />);

        expect(document.head.querySelector('meta[http-equiv="Content-Language"]')).toHaveAttribute('content', 'en');

        const prefetches = Array.from(document.head.querySelectorAll('link[rel="dns-prefetch"]')).map((el) => el.getAttribute('href'));
        expect(prefetches).toContain('https://www.googletagmanager.com');
        expect(prefetches).toContain('https://www.clarity.ms');
        expect(prefetches).toContain('https://scripts.clarity.ms');
        expect(prefetches).toContain('https://firebaseinstallations.googleapis.com');

        const preconnects = Array.from(document.head.querySelectorAll('link[rel="preconnect"]')).map((el) => el.getAttribute('href'));
        expect(preconnects).toContain('https://challenges.cloudflare.com');

        vi.doUnmock('../../config/intl_config');
    });

    it('omits hints when analytics and firebaseAuth are missing', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                defaultLocale: 'en',
            },
        }));

        const { default: MinimalHelperScript } = await import('./helper_script.js');
        render(<MinimalHelperScript />);

        expect(document.head.querySelector('link[rel="dns-prefetch"]')).toBeNull();
        expect(document.head.querySelector('link[rel="preconnect"]')).toBeNull();

        vi.doUnmock('../../config/intl_config');
    });

    it('supports googleAdsId and googleAdSenseId', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                cookieConsent: {
                    analytics: {
                        googleAdsId: 'AW-123',
                    },
                },
            },
        }));
        const { default: AdsScript } = await import('./helper_script.js');
        render(<AdsScript />);
        expect(document.head.querySelector('link[href="https://www.googletagmanager.com"]')).not.toBeNull();
        cleanup();

        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                cookieConsent: {
                    analytics: {
                        googleAdSenseId: 'ca-pub-123',
                    },
                },
            },
        }));
        const { default: AdSenseScript } = await import('./helper_script.js');
        render(<AdSenseScript />);
        expect(document.head.querySelector('link[href="https://www.googletagmanager.com"]')).not.toBeNull();
        vi.doUnmock('../../config/intl_config');
    });
});
