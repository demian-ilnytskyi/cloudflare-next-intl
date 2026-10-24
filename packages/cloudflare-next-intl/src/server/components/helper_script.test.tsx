import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

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

    it('renders stale-deploy-early-catch when not in development', async () => {
        vi.resetModules();
        const { default: ProdHelperScript } = await import('./helper_script.js');
        const { container } = render(<ProdHelperScript />);
        expect(container.querySelector('#stale-deploy-early-catch')).not.toBeNull();
        expect(container.querySelector('#build-id-script')).not.toBeNull();
    });

    it('theme script precedes locale script', async () => {
        vi.resetModules();
        const { default: HelperScript } = await import('./helper_script.js');
        const { container } = render(<HelperScript />);
        const themeScript = container.querySelector('#cfni-theme') || container.querySelector('#cfni-theme-script');
        const localeScript = container.querySelector('#intl-app-state-checker');

        expect(themeScript).not.toBeNull();
        expect(localeScript).not.toBeNull();
        expect(Boolean(themeScript!.compareDocumentPosition(localeScript!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('forwards custom staleDeployReloadHtml to StaleDeployScripts', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                errorHandling: {
                    staleDeployReloadHtml: '<div id="custom-reload-overlay">loading...</div>',
                },
            },
        }));
        const { default: CustomHelperScript } = await import('./helper_script.js');
        const { container } = render(<CustomHelperScript />);
        const script = container.querySelector('#stale-deploy-early-catch');
        expect(script?.textContent).toContain('custom-reload-overlay');
        vi.doUnmock('../../config/intl_config');
    });
});
