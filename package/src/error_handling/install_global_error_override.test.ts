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
        const { default: install } = await import('./install_global_error_override');
        const addEventListener = vi.spyOn(window, 'addEventListener');
        install(undefined);
        install({ errorHandling: { overrideWindowErrors: false, overrideConsoleError: false } });
        expect(addEventListener).not.toHaveBeenCalledWith('error', expect.anything());
        addEventListener.mockRestore();
    });

    it('defaults to overrideConsoleError\'s value when overrideWindowErrors is omitted', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onError = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ classOrMethodName: 'Global Window Error Handler' }));
    });

    it('overrideWindowErrors: false opts out even when overrideConsoleError is true', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onError = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, overrideWindowErrors: false, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports uncaught errors via the error listener, using event.error when present', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        const err = new Error('boom');
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: err }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: err, classOrMethodName: 'Global Window Error Handler', isClient: true }));
    });

    it('falls back to the stringified message when event.error is absent', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom, no error object' }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: 'boom, no error object' }));
    });

    it('reports unhandled promise rejections', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onError = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError } });
        const reason = new Error('rejected');
        window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.reject(reason).catch(() => {}) }));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: reason, classOrMethodName: 'Global Unhandled Rejection Handler', isClient: true }));
    });

    it('is a no-op when window does not exist (server-side)', async () => {
        vi.stubGlobal('window', undefined);
        try {
            const { default: install } = await import('./install_global_error_override');
            const onError = vi.fn();
            expect(() => install({ errorHandling: { overrideWindowErrors: true, onError } })).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('only installs once', async () => {
        const { default: install } = await import('./install_global_error_override');
        const onErrorA = vi.fn();
        const onErrorB = vi.fn();
        install({ errorHandling: { overrideWindowErrors: true, onError: onErrorA } });
        install({ errorHandling: { overrideWindowErrors: true, onError: onErrorB } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        expect(onErrorA).toHaveBeenCalled();
        expect(onErrorB).not.toHaveBeenCalled();
    });
});
