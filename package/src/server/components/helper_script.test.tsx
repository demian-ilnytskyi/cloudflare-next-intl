import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HelperScript from './helper_script';

vi.mock('../../client/components/client_helper_script', () => ({ default: () => null }));

afterEach(() => {
    cleanup();
});

describe('HelperScript', () => {
    it('renders the app-state-checker script and the build-id script outside dev', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        expect(root.querySelector('#intl-app-state-checker')).not.toBeNull();
        expect(root.querySelector('#build-id-script')).not.toBeNull();
        vi.unstubAllEnvs();
    });

    it('omits the build-id script in dev', async () => {
        vi.resetModules();
        vi.stubEnv('NODE_ENV', 'development');
        const { default: DevHelperScript } = await import('./helper_script');
        const { container: root } = render(<DevHelperScript />);
        expect(root.querySelector('#build-id-script')).toBeNull();
        expect(root.querySelector('#intl-app-state-checker')).not.toBeNull();
        vi.unstubAllEnvs();
    });

    it('defers the stale-build reload until the document has finished loading', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#build-id-script')?.textContent ?? '';
        expect(source).toContain("document.readyState === 'complete'");
        expect(source).toContain("window.addEventListener(");
        expect(source).not.toContain('reload(true)');
        vi.unstubAllEnvs();
    });

    // React 19 hoists `<script src>` out of the component tree into <head>.
    const recaptchaScript = (): Element | null =>
        document.head.querySelector('script[src="https://www.google.com/recaptcha/api.js?render=explicit"]');

    it('omits the reCAPTCHA script when App Check is not configured', () => {
        render(<HelperScript />);
        expect(recaptchaScript()).toBeNull();
    });

    it('loads the explicit reCAPTCHA script when a v3 site key is configured', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                defaultLocale: 'en',
                firebaseAuth: { appCheck: { recaptchaV3SiteKey: 'site-key' } },
            },
        }));
        const { default: AppCheckHelperScript } = await import('./helper_script');
        render(<AppCheckHelperScript />);
        expect(recaptchaScript()).not.toBeNull();
        recaptchaScript()?.remove();
        vi.doUnmock('../../config/intl_config');
    });

    it('omits the reCAPTCHA script when useExplicitRecaptchaScript is false', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config', () => ({
            default: {
                defaultLocale: 'en',
                firebaseAuth: {
                    appCheck: { recaptchaV3SiteKey: 'site-key', useExplicitRecaptchaScript: false },
                },
            },
        }));
        const { default: LegacyHelperScript } = await import('./helper_script');
        render(<LegacyHelperScript />);
        expect(recaptchaScript()).toBeNull();
        vi.doUnmock('../../config/intl_config');
    });
});
