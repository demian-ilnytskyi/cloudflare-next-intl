import { describe, it, expect, vi, afterEach } from 'vitest';
import installConsoleErrorOverride from './install_console_error_override.js';
import { consoleOverrideState } from './report_error.js';

describe('installConsoleErrorOverride', () => {
    const originalConsoleError = console.error;
    afterEach(() => {
        console.error = originalConsoleError;
        consoleOverrideState.active = false;
        vi.resetModules();
    });

    it('does nothing when overrideConsoleError is not true', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const before = console.error;
        install(undefined);
        install({ errorHandling: { overrideConsoleError: false } });
        expect(console.error).toBe(before);
    });

    it('routes console.error through onError and still calls the original', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        console.error('oops', { extra: 1 });
        expect(original).toHaveBeenCalledWith('oops', { extra: 1 });
        expect(onError).toHaveBeenCalledWith({ error: 'oops', classOrMethodName: 'Global Console Error Handler', params: [{ extra: 1 }], formattedMessage: expect.stringContaining('[Global Console Error Handler] Error:') });
    });

    it('logs a descriptive message instead of a bare undefined, but reports the raw value', async () => {
        vi.resetModules();
        const { default: install, EMPTY_CONSOLE_ERROR_MESSAGE } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        console.error();
        expect(original).toHaveBeenCalledWith(expect.stringContaining(EMPTY_CONSOLE_ERROR_MESSAGE));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: undefined,
            params: [expect.stringContaining(EMPTY_CONSOLE_ERROR_MESSAGE)],
        }));
    });

    it('handles environments where Error stack is empty when logging argument-less console.error', async () => {
        vi.resetModules();
        const { default: install, EMPTY_CONSOLE_ERROR_MESSAGE } = await import('./install_console_error_override.js');
        const original = vi.fn();
        console.error = original;
        const originalError = global.Error;
        // @ts-expect-error mock Error constructor to produce instance without stack
        global.Error = class MockError extends originalError {
            constructor(message?: string) {
                super(message);
                Object.defineProperty(this, 'stack', { value: undefined, writable: true, configurable: true });
            }
        };
        try {
            install({ errorHandling: { overrideConsoleError: true } });
            console.error(undefined);
            expect(original).toHaveBeenCalledWith(EMPTY_CONSOLE_ERROR_MESSAGE);
        } finally {
            global.Error = originalError;
        }
    });

    it('only installs once', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onErrorA = vi.fn();
        const onErrorB = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError: onErrorA } });
        install({ errorHandling: { overrideConsoleError: true, onError: onErrorB } });
        console.error('oops');
        expect(onErrorA).toHaveBeenCalled();
        expect(onErrorB).not.toHaveBeenCalled();
    });

    it('skips reporting (but still logs) when ignoreConsoleError returns true', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError, ignoreConsoleError: (message) => message.includes('noisy') } });
        console.error('this is noisy');
        expect(original).toHaveBeenCalledWith('this is noisy');
        expect(onError).not.toHaveBeenCalled();
    });

    it('skips reporting known Firebase Auth error codes by default (defaultIgnoredConsoleErrors)', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        console.error('auth/wrong-password');
        expect(original).toHaveBeenCalledWith('auth/wrong-password');
        expect(onError).not.toHaveBeenCalled();
    });

    it('ignoreConsoleErrors replaces the default list entirely', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError, ignoreConsoleErrors: [] } });
        console.error('auth/wrong-password');
        expect(onError).toHaveBeenCalled();
    });

    it('always logs every call, even ones reportError throttles away', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        for (let i = 0; i < 25; i++) console.error('same error, repeated in a tight loop');
        expect(original).toHaveBeenCalledTimes(25);
        // reportError's own default 5s dedup throttles the repeat reports —
        // this only asserts logging is never affected by that.
        expect(onError.mock.calls.length).toBeLessThan(25);
    });

    it('reports distinct messages individually — no count-based cap', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError } });
        for (let i = 0; i < 25; i++) console.error(`distinct error ${i}`);
        expect(onError).toHaveBeenCalledTimes(25);
    });

    it('sets consoleOverrideState.active to true once installed', async () => {
        vi.resetModules();
        const { consoleOverrideState: freshState } = await import('./report_error.js');
        const { default: install } = await import('./install_console_error_override.js');
        console.error = vi.fn();
        expect(freshState.active).toBe(false);
        install({ errorHandling: { overrideConsoleError: true, onError: vi.fn() } });
        expect(freshState.active).toBe(true);
    });

    it('does not recurse: reportError\'s own console.error fallback (onError throwing) is suppressed while the override is active, so it never re-enters the override', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const originalConsoleErrorSpy = vi.fn();
        console.error = originalConsoleErrorSpy;
        const onError = vi.fn(() => { throw new Error('reporter broke'); });
        install({ errorHandling: { overrideConsoleError: true, onError } });
        console.error('oops');
        // Flush the microtask reportError's async callOnError runs in.
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Exactly one real console write: the override's own initial log of
        // 'oops'. If reportError's onError-threw fallback also called
        // console.error, that call would land on the override again and
        // recurse — it must not log a second time.
        expect(originalConsoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(originalConsoleErrorSpy).toHaveBeenCalledWith('oops');
    });

    it('suppresses the real console.error output on the client when suppressClientConsoleError is true, but still reports via onError', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError, suppressClientConsoleError: true } }, true);
        console.error('oops');
        expect(original).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: 'oops' }));
    });

    it('does not suppress console.error server-side even if suppressClientConsoleError is true (isClient omitted/false)', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError, suppressClientConsoleError: true } });
        console.error('oops');
        expect(original).toHaveBeenCalledWith('oops');
        expect(onError).toHaveBeenCalled();
    });

    it('logs normally on the client when suppressClientConsoleError is not set', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } }, true);
        console.error('oops');
        expect(original).toHaveBeenCalledWith('oops');
        expect(onError).toHaveBeenCalled();
    });
});
