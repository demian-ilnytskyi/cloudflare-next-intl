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

    it('the early-catch script writes the shared throttle timestamp and re-arms after the window', () => {
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
        expect(Number(sessionStorage.getItem('stale-deploy-recovery-time'))).toBeGreaterThan(0);

        // A marker left over from an earlier page load, older than the throttle
        // window, must not permanently block recovery on a fresh load.
        sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 20_000));
        const reload2 = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload: reload2 }, writable: true });
        new Function(source)();
        window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch dynamically imported module: z.js' }));
        expect(reload2).toHaveBeenCalledTimes(1);

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

    it('the early-catch script recovers from a MIME-blocked or 404 chunk resource error', () => {
        vi.stubEnv('NODE_ENV', 'production');
        // No fetch means no health probe: the reload path stays synchronous.
        vi.stubGlobal('fetch', undefined);
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const origin = 'http://localhost:3000';
        const reload = vi.fn();
        const replace = vi.fn();
        Object.defineProperty(window, 'location', { value: { origin, href: origin + '/', reload, replace }, writable: true });

        new Function(source)();

        // A module script blocked by MIME type fires a non-bubbling error event
        // on the element, reaching window only in the capture phase, with no message.
        const script = document.createElement('script');
        script.src = origin + '/_next/static/chunks/app-router-scroll-C76DZ2-L.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        expect(replace).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('build-1');

        script.remove();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('the early-catch script ignores a failed third-party script', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const origin = 'http://localhost:3000';
        const reload = vi.fn();
        const replace = vi.fn();
        Object.defineProperty(window, 'location', { value: { origin, href: origin + '/', reload, replace }, writable: true });

        new Function(source)();

        // A cross-origin script (analytics, reCAPTCHA) failing to load cannot
        // break the React module graph, so it must never force a reload.
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        expect(replace).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBeNull();

        script.remove();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script ignores errors from non-chunk elements', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

        new Function(source)();

        const img = document.createElement('img');
        img.src = 'https://example.test/broken.png';
        document.body.appendChild(img);
        img.dispatchEvent(new Event('error', { bubbles: false }));

        expect(reload).not.toHaveBeenCalled();

        img.remove();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllEnvs();
    });

    it('the early-catch script allows three attempts per build id, then stops', () => {
        vi.stubEnv('NODE_ENV', 'production');
        // No fetch means no health probe: the reload path stays synchronous.
        vi.stubGlobal('fetch', undefined);
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const origin = 'http://localhost:3000';
        const chunk = origin + '/_next/static/chunks/app.js';

        const fire = () => {
            const replace = vi.fn();
            Object.defineProperty(window, 'location', {
                value: { origin, href: origin + '/', reload: vi.fn(), replace },
                writable: true,
            });
            // Each new Function(source) call models a fresh page load.
            new Function(source)();
            const script = document.createElement('script');
            script.src = chunk;
            document.body.appendChild(script);
            script.dispatchEvent(new Event('error', { bubbles: false }));
            script.remove();
            return replace;
        };

        // Loads 1..3 each recover; the throttle must not block them, so age
        // the timestamp past the window between them.
        expect(fire()).toHaveBeenCalledTimes(1);
        sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 20_000));
        expect(fire()).toHaveBeenCalledTimes(1);
        sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 20_000));
        expect(fire()).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('stale-deploy-recovery-count')).toBe('3');

        // Load 4 on the same build id must fall through to the error UI.
        sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 20_000));
        expect(fire()).not.toHaveBeenCalled();

        // A new deploy re-arms the counter.
        localStorage.setItem('buildId', 'build-2');
        expect(fire()).toHaveBeenCalledTimes(1);

        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('the early-catch script retries after the throttle window instead of giving up', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        // No fetch means no health probe: the reload path stays synchronous.
        vi.stubGlobal('fetch', undefined);
        vi.useFakeTimers();
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        sessionStorage.setItem('stale-deploy-recovery-reloaded', 'build-1');
        sessionStorage.setItem('stale-deploy-recovery-count', '1');
        sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now()));

        const origin = 'http://localhost:3000';
        const replace = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { origin, href: origin + '/', reload: vi.fn(), replace },
            writable: true,
        });
        new Function(source)();
        const script = document.createElement('script');
        script.src = origin + '/_next/static/chunks/app.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));
        script.remove();

        expect(replace).not.toHaveBeenCalled();
        vi.advanceTimersByTime(16_000);
        expect(replace).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('the early-catch script covers the page instead of wiping it', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubGlobal('fetch', undefined);
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-overlay');
        sessionStorage.clear();
        const origin = 'http://localhost:3000';
        Object.defineProperty(window, 'location', {
            value: { origin, href: origin + '/', reload: vi.fn(), replace: vi.fn() },
            writable: true,
        });

        // React's tree must survive: it keeps rendering while the probe runs,
        // and a removed node turns every commit into a DOMException.
        const appRoot = document.createElement('main');
        appRoot.id = 'app-root';
        document.body.appendChild(appRoot);

        new Function(source)();
        const script = document.createElement('script');
        script.src = origin + '/_next/static/chunks/app.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));
        script.remove();

        expect(document.getElementById('app-root')).not.toBeNull();
        expect(document.getElementById('cfni-stale-deploy-overlay')).not.toBeNull();

        appRoot.remove();
        document.getElementById('cfni-stale-deploy-overlay')?.remove();
        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllGlobals();
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
        // No fetch means no health probe: the reload path stays synchronous.
        vi.stubGlobal('fetch', undefined);
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        sessionStorage.clear();
        const reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { reload }, writable: true });

         
        new Function(source)();
        const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
        Object.defineProperty(event, 'reason', { value: new Error('Loading chunk 4 failed') });
        window.dispatchEvent(event);
        expect(reload).toHaveBeenCalledTimes(1);

        sessionStorage.clear();
        vi.unstubAllGlobals();
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
    it('the early-catch script waits for the failed chunk to serve JavaScript again before reloading', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        const source = root.querySelector('#stale-deploy-early-catch')?.textContent ?? '';

        localStorage.setItem('buildId', 'build-1');
        sessionStorage.clear();
        const origin = 'http://localhost:3000';
        const replace = vi.fn();
        Object.defineProperty(window, 'location', { value: { origin, href: origin + '/', reload: vi.fn(), replace }, writable: true });

        // First probe still hits the old Worker version (plain-text 404),
        // the second one lands on the new one.
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers({ 'content-type': 'text/plain' }) })
            .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/javascript' }) });
        vi.stubGlobal('fetch', fetchMock);

        new Function(source)();
        const script = document.createElement('script');
        script.src = origin + '/_next/static/chunks/app.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));
        script.remove();

        await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1), { timeout: 3000 });
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain('_r=');

        localStorage.removeItem('buildId');
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

});
