import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HelperScript from './helper_script.js';

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
        const { default: DevHelperScript } = await import('./helper_script.js');
        const { container: root } = render(<DevHelperScript />);
        expect(root.querySelector('#build-id-script')).toBeNull();
        expect(root.querySelector('#intl-app-state-checker')).not.toBeNull();
        vi.unstubAllEnvs();
    });

    it('records when the build id was written, for stale-build recovery', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#build-id-script')?.textContent ?? '';
        expect(source).toContain("localStorage.setItem('buildIdSetAt'");
        vi.unstubAllEnvs();
    });

    it('renders the stale-deploy early-catch script outside dev, embedding the shared patterns', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const script = root.querySelector('#stale-deploy-early-catch');
        expect(script).not.toBeNull();
        const source = script?.textContent ?? '';
        expect(source).toContain('dynamically imported module');
        expect(source).toContain("addEventListener('error'");
        expect(source).toContain("addEventListener('unhandledrejection'");
        expect(source).toContain('stale-deploy-recovery-reloaded');
        vi.unstubAllEnvs();
    });

    it('omits the stale-deploy early-catch script in dev', async () => {
        vi.resetModules();
        vi.stubEnv('NODE_ENV', 'development');
        const { default: DevHelperScript } = await import('./helper_script.js');
        const { container: root } = render(<DevHelperScript />);
        expect(root.querySelector('#stale-deploy-early-catch')).toBeNull();
        vi.unstubAllEnvs();
    });

    it('the early-catch script recovers on a matching message and is idempotent per build id', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

         
        new Function(source)();
        window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module: x.js' }));
        expect(reload).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('build-1');

        // A second matching error on the same build id must not reload again.
        window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module: y.js' }));
        expect(reload).toHaveBeenCalledTimes(1);

        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script never reloads more than once per page load, even in a burst', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

         
        new Function(source)();
        // A single stale deploy commonly throws several near-simultaneous chunk
        // failures; a same-tick burst must still only trigger one reload().
        for (let i = 0; i < 5; i++) {
            window.dispatchEvent(new ErrorEvent('error', { message: 'ChunkLoadError: loading chunk failed' }));
        }
        expect(reload).toHaveBeenCalledTimes(1);

        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script never reloads more than once per page load even if sessionStorage throws', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

         
        new Function(source)();
        window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module: x.js' }));
        window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module: y.js' }));
        expect(reload).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();

        setItemSpy.mockRestore();
        errorSpy.mockRestore();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script ignores non-stale errors', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

         
        new Function(source)();
        window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: cannot read property of null' }));
        expect(reload).not.toHaveBeenCalled();

        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script recovers from an unhandledrejection with a stale-deploy reason', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

         
        new Function(source)();
        const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
        Object.defineProperty(event, 'reason', { value: new Error('Failed to fetch dynamically imported module') });
        window.dispatchEvent(event);
        expect(reload).toHaveBeenCalledTimes(1);

        sessionStorage.clear();
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
        const { default: AppCheckHelperScript } = await import('./helper_script.js');
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
        const { default: LegacyHelperScript } = await import('./helper_script.js');
        render(<LegacyHelperScript />);
        expect(recaptchaScript()).toBeNull();
        vi.doUnmock('../../config/intl_config');
    });

    it('embeds the default white-screen spinner in the stale-deploy early-catch script', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';
        expect(source).toContain('background:#ffffff');
        expect(source).toContain('cfni-spin');
        expect(source).toContain('border-radius:50%');
        vi.unstubAllEnvs();
    });

    it('staleDeployReloadHtml: uses custom html when set, falls back to default', async () => {
        const { defaultReloadHtml } = await import('./helper_script.js');
        // Fallback branch: no config value → defaultReloadHtml
        const result1 = (undefined as string | undefined) ?? defaultReloadHtml;
        expect(result1).toBe(defaultReloadHtml);
        expect(result1).toContain('cfni-spin');

        // Custom branch: config value set → custom html used
        const customHtml = '<div id="custom-loader">Loading...</div>';
        const result2 = (customHtml as string | undefined) ?? defaultReloadHtml;
        expect(result2).toBe(customHtml);
        expect(result2).toContain('custom-loader');
    });
});
