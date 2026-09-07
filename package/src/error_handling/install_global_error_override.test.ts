import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('installGlobalErrorOverride', () => {
    beforeEach(() => {
        delete (window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled;
    });

    afterEach(() => {
        vi.resetModules();
        delete (window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled;
    });

    it('does nothing when overrideWindowErrors and overrideConsoleError are both not true', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const addEventListener = vi.spyOn(window, 'addEventListener');
        install(undefined);
        install({ errorHandling: { overrideWindowErrors: false, overrideConsoleError: false } });
        expect(addEventListener).not.toHaveBeenCalledWith('error', expect.anything());
        addEventListener.mockRestore();
    });

    it('defaults to overrideConsoleError\'s value when overrideWindowErrors is omitted', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ classOrMethodName: 'Global Window Error Handler' }));
    });

    it('overrideWindowErrors: false opts out even when overrideConsoleError is true', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, overrideWindowErrors: false, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports uncaught errors via the error listener, using event.error when present', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        const err = new Error('boom');
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: err }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: err, classOrMethodName: 'Global Window Error Handler', isClient: true }));
    });

    it('falls back to the stringified message when event.error is absent', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom, no error object' }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: 'boom, no error object' }));
    });

    it('reports unhandled promise rejections', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        const reason = new Error('rejected');
        window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.reject(reason).catch(() => {}) }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: reason, classOrMethodName: 'Global Unhandled Rejection Handler', isClient: true }));
    });

    it('reports a failed script resource that only reaches window during capture', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });

        const script = document.createElement('script');
        script.src = 'https://example.test/chunks/app.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: 'Failed to load script resource: https://example.test/chunks/app.js',
            classOrMethodName: 'Global Resource Error Handler',
            isClient: true,
        }));
        script.remove();
    });

    it('ignores resource errors from elements that cannot break the module graph', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });

        const img = document.createElement('img');
        img.src = 'https://example.test/broken.png';
        document.body.appendChild(img);
        img.dispatchEvent(new Event('error', { bubbles: false }));

        expect(onError).not.toHaveBeenCalled();
        img.remove();
    });

    it('ignores a script/link resource error with no src or href', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });

        const script = document.createElement('script');
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        expect(onError).not.toHaveBeenCalled();
        script.remove();
    });

    it('does not treat a plain window-targeted error as a resource error', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        onError.mockClear();

        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: window, configurable: true });
        window.dispatchEvent(event);

        expect(onError).not.toHaveBeenCalledWith(expect.objectContaining({ classOrMethodName: 'Global Resource Error Handler' }));
    });

    it('is a no-op when window does not exist (server-side)', async () => {
        vi.stubGlobal('window', undefined);
        try {
            const { default: install } = await import('./install_global_error_override.js');
            const onError = vi.fn();
            expect(() => install({ errorHandling: { overrideWindowErrors: true, onError } })).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('only installs once', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onErrorA = vi.fn();
        const onErrorB = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError: onErrorA } });
        install({ errorHandling: { overrideWindowErrors: true, onError: onErrorB } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onErrorA).toHaveBeenCalled();
        expect(onErrorB).not.toHaveBeenCalled();
    });
});
