import { describe, it, expect, vi, afterEach } from 'vitest';

describe('installConsoleErrorOverride perf characteristics', () => {
    const originalConsoleError = console.error;
    afterEach(() => {
        console.error = originalConsoleError;
        vi.resetModules();
    });

    it('throttles a render-loop burst that logs the same error repeatedly', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError } });
        // Simulates a component stuck re-throwing the same error on every
        // render — reportError's default 5s same-key dedup collapses this
        // burst down to a single report instead of 500.
        for (let i = 0; i < 500; i++) console.error('render loop error');
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('the ignore-list check is a plain substring scan, not re-stringifying already-string messages', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override.js');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError, ignoreConsoleErrors: ['auth/wrong-password'] } });
        console.error('auth/wrong-password: invalid credentials');
        console.error('unrelated failure');
        expect(onError).toHaveBeenCalledTimes(1);
    });
});
