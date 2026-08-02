import { describe, it, expect, vi, afterEach } from 'vitest';
import reportError from './report_error';

describe('reportError', () => {
    const originalConsoleError = console.error;
    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('reports via console.error(formattedMessage) by default', async () => {
        console.error = vi.fn();
        const error = new Error('boom');
        await reportError(undefined, { error, classOrMethodName: 'foo' });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[foo] Error: Error: boom'));
    });

    it('reports via config.errorHandling.onError when set, with formattedMessage populated', async () => {
        const onError = vi.fn();
        const error = new Error('boom');
        await reportError({ errorHandling: { onError } }, { error, classOrMethodName: 'foo' });
        expect(onError).toHaveBeenCalledWith({ error, classOrMethodName: 'foo', formattedMessage: expect.stringContaining('[foo] Error:') });
    });

    it('does not report when enable is false', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { enable: false, onError } }, { error: new Error('boom'), classOrMethodName: 'foo' });
        expect(onError).not.toHaveBeenCalled();
    });

    it('falls back to console.error(formattedMessage) when onError itself throws', async () => {
        console.error = vi.fn();
        const onError = vi.fn(() => { throw new Error('reporter broke'); });
        const params = { error: new Error('boom'), classOrMethodName: 'foo' };
        await reportError({ errorHandling: { onError } }, params);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[foo] Error: Error: boom'));
    });

    it('does not report when consent is false', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('boom'), classOrMethodName: 'foo', consent: false });
        expect(onError).not.toHaveBeenCalled();
    });

    it('does not report when consent is null (not yet decided)', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('boom'), classOrMethodName: 'foo', consent: null });
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports when consent is true', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('boom'), classOrMethodName: 'foo', consent: true });
        expect(onError).toHaveBeenCalled();
    });

    it('reports when consent is omitted (not applicable)', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('boom'), classOrMethodName: 'foo' });
        expect(onError).toHaveBeenCalled();
    });

    it('backgrounds the report via ctx.waitUntil when generate.getCloudflareContext resolves one', async () => {
        const onError = vi.fn();
        const waitUntil = vi.fn();
        const getCloudflareContext = vi.fn(() => ({ ctx: { waitUntil } }));
        await reportError(
            { errorHandling: { onError }, generate: { getCloudflareContext: getCloudflareContext as never } },
            { error: new Error('boom'), classOrMethodName: 'foo' },
        );
        expect(getCloudflareContext).toHaveBeenCalledWith({ async: false });
        expect(waitUntil).toHaveBeenCalled();
    });

    it('dedups a repeated identical error within the throttle window by default', async () => {
        const onError = vi.fn();
        const params = { error: new Error('dedup-boom'), classOrMethodName: 'dedupTest1' };
        await reportError({ errorHandling: { onError } }, params);
        await reportError({ errorHandling: { onError } }, params);
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('does not dedup when dedup is set to false', async () => {
        const onError = vi.fn();
        const params = { error: new Error('dedup-boom2'), classOrMethodName: 'dedupTest2' };
        await reportError({ errorHandling: { onError, dedup: false } }, params);
        await reportError({ errorHandling: { onError, dedup: false } }, params);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('reports again once throttleMs has elapsed', async () => {
        const onError = vi.fn();
        const params = { error: new Error('dedup-boom3'), classOrMethodName: 'dedupTest3' };
        await reportError({ errorHandling: { onError, throttleMs: 0 } }, params);
        await reportError({ errorHandling: { onError, throttleMs: 0 } }, params);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('reports again immediately after resetDedup: true clears the dedup state', async () => {
        const onError = vi.fn();
        const params = { error: new Error('dedup-boom4'), classOrMethodName: 'dedupTest4' };
        await reportError({ errorHandling: { onError } }, params);
        await reportError({ errorHandling: { onError, resetDedup: true } }, params);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('dedups by an explicit dedupKey when provided, ignoring differing error/params', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('a'), classOrMethodName: 'x', dedupKey: 'same-key' });
        await reportError({ errorHandling: { onError } }, { error: new Error('b'), classOrMethodName: 'y', dedupKey: 'same-key' });
        expect(onError).toHaveBeenCalledTimes(1);
    });
});
