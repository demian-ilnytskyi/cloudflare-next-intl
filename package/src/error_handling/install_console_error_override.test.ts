import { describe, it, expect, vi, afterEach } from 'vitest';
import installConsoleErrorOverride from './install_console_error_override';

describe('installConsoleErrorOverride', () => {
    const originalConsoleError = console.error;
    afterEach(() => {
        console.error = originalConsoleError;
        vi.resetModules();
    });

    it('does nothing when overrideConsoleError is not true', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
        const before = console.error;
        install(undefined);
        install({ errorHandling: { overrideConsoleError: false } });
        expect(console.error).toBe(before);
    });

    it('routes console.error through onError and still calls the original', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        console.error('oops', { extra: 1 });
        expect(original).toHaveBeenCalledWith('oops', { extra: 1 });
        expect(onError).toHaveBeenCalledWith({ error: 'oops', classOrMethodName: 'Global Console Error Handler', params: [{ extra: 1 }], formattedMessage: expect.stringContaining('[Global Console Error Handler] Error:') });
    });

    it('only installs once', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
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
        const { default: install } = await import('./install_console_error_override');
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
        const { default: install } = await import('./install_console_error_override');
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
        const { default: install } = await import('./install_console_error_override');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError, ignoreConsoleErrors: [] } });
        console.error('auth/wrong-password');
        expect(onError).toHaveBeenCalled();
    });

    it('stops reporting after MAX_REPORTS_PER_INSTALL calls, but keeps logging', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
        const onError = vi.fn();
        const original = vi.fn();
        console.error = original;
        install({ errorHandling: { overrideConsoleError: true, onError } });
        for (let i = 0; i < 25; i++) console.error(`err ${i}`);
        expect(original).toHaveBeenCalledTimes(25);
        expect(onError).toHaveBeenCalledTimes(20);
    });
});
