import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ReportErrorConfig } from './report_error.js';

// Every listener installed by this module now reports through
// `reportClientError`, which reads `@intl-config` rather than the `config`
// object passed to `install(...)` — that passed-in config is still used for
// the enable-check only. Mirrors `report_client_error.test.ts`'s own harness.
let currentConfig: ReportErrorConfig = {};
vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({ get: () => null })),
}));

function configWithOnError(onError: (params: unknown) => void): ReportErrorConfig {
    return { errorHandling: { onError, dedup: false } };
}

// `reportClientError` reads the shared, mutable `currentConfig` above at
// CALL time, not at listener-registration time (unlike the old direct
// `reportError(config, ...)` call, which closed over that test's own
// literal `config`). A listener this module has no way to remove — it
// registers on the real, test-shared `window` and is never torn down —
// would otherwise still be live in a LATER test and fire into THAT test's
// `onError` the moment `currentConfig` points there. Recording and removing
// every listener `install()` adds is what keeps each test isolated.
const addedListeners: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];
const originalAddEventListener = window.addEventListener.bind(window);

describe('installGlobalErrorOverride', () => {
    beforeEach(() => {
        delete (window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled;
        currentConfig = {};
        vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
            addedListeners.push([type, listener, options]);
            originalAddEventListener(type, listener, options);
        });
    });

    afterEach(() => {
        vi.resetModules();
        delete (window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled;
        vi.restoreAllMocks();
        for (const [type, listener, options] of addedListeners.splice(0)) {
            window.removeEventListener(type, listener, options);
        }
    });

    it('does nothing when overrideWindowErrors and overrideConsoleError are both not true', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        install(undefined);
        install({ errorHandling: { overrideWindowErrors: false, overrideConsoleError: false } });
        expect(window.addEventListener).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('defaults to overrideConsoleError\'s value when overrideWindowErrors is omitted', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideConsoleError: true } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ classOrMethodName: 'Global Window Error Handler' })));
    });

    it('overrideWindowErrors: false opts out even when overrideConsoleError is true', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideConsoleError: true, overrideWindowErrors: false } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports uncaught errors via the error listener — through reportClientError, not the passed config', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        // A config with no onError at all — proves the report did not go
        // through this object; if it had, nothing would be called.
        install({ errorHandling: { overrideWindowErrors: true } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('Error: boom'),
            classOrMethodName: 'Global Window Error Handler',
            isClient: true,
        })));
    });

    it('falls back to the stringified message when event.error is absent', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom, no error object' }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: 'boom, no error object' })));
    });

    it('reports unhandled promise rejections', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });
        const reason = new Error('rejected');
        window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.reject(reason).catch(() => {}) }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('Error: rejected'),
            classOrMethodName: 'Global Unhandled Rejection Handler',
            isClient: true,
        })));
    });

    it('reports a failed script resource that only reaches window during capture', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });

        const script = document.createElement('script');
        script.src = 'https://example.test/chunks/app.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: 'Failed to load script resource: https://example.test/chunks/app.js',
            classOrMethodName: 'Global Resource Error Handler',
            isClient: true,
        })));
        script.remove();
    });

    it('ignores resource errors from elements that cannot break the module graph', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });

        const img = document.createElement('img');
        img.src = 'https://example.test/broken.png';
        document.body.appendChild(img);
        img.dispatchEvent(new Event('error', { bubbles: false }));

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onError).not.toHaveBeenCalled();
        img.remove();
    });

    it('ignores a script/link resource error with no src or href', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });

        const script = document.createElement('script');
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error', { bubbles: false }));

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onError).not.toHaveBeenCalled();
        script.remove();
    });

    it('does not treat a plain window-targeted error as a resource error', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });
        onError.mockClear();

        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: window, configurable: true });
        window.dispatchEvent(event);

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onError).not.toHaveBeenCalledWith(expect.objectContaining({ classOrMethodName: 'Global Resource Error Handler' }));
    });

    it('is a no-op when window does not exist (server-side)', async () => {
        vi.stubGlobal('window', undefined);
        try {
            const { default: install } = await import('./install_global_error_override.js');
            expect(() => install({ errorHandling: { overrideWindowErrors: true } })).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('only installs once', async () => {
        const { default: install } = await import('./install_global_error_override.js');
        const onError = vi.fn();
        currentConfig = configWithOnError(onError);
        install({ errorHandling: { overrideWindowErrors: true } });
        install({ errorHandling: { overrideWindowErrors: true } });
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom', error: new Error('boom') }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    });
});
