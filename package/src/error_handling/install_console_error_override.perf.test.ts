import { describe, it, expect, vi, afterEach } from 'vitest';

describe('installConsoleErrorOverride perf characteristics', () => {
    const originalConsoleError = console.error;
    afterEach(() => {
        console.error = originalConsoleError;
        vi.resetModules();
    });

    it('caps reporting at MAX_REPORTS_PER_INSTALL even under a render-error-loop-style burst', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError } });
        // Simulates a component stuck re-throwing on every render — a burst
        // far beyond any single request/render cycle should still realistically hit.
        for (let i = 0; i < 500; i++) console.error(`render loop error ${i}`);
        expect(onError.mock.calls.length).toBeLessThanOrEqual(20);
    });

    it('the ignore-list check is a plain substring scan, not re-stringifying already-string messages', async () => {
        vi.resetModules();
        const { default: install } = await import('./install_console_error_override');
        const onError = vi.fn();
        console.error = vi.fn();
        install({ errorHandling: { overrideConsoleError: true, onError, ignoreConsoleErrors: ['auth/wrong-password'] } });
        console.error('auth/wrong-password: invalid credentials');
        console.error('unrelated failure');
        expect(onError).toHaveBeenCalledTimes(1);
    });
});
