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
});
