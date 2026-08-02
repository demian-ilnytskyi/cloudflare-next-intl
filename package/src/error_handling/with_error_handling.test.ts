import { describe, it, expect, vi } from 'vitest';
import withErrorHandling from './with_error_handling';

describe('withErrorHandling', () => {
    it('returns the wrapped function result when it does not throw', async () => {
        const wrapped = withErrorHandling(async (x: number) => x * 2, 'double');
        expect(await wrapped(2)).toBe(4);
    });

    it('reports then rethrows when the wrapped function throws', async () => {
        const onError = vi.fn();
        const boom = new Error('boom');
        const wrapped = withErrorHandling(() => { throw boom; }, 'fails', { config: { errorHandling: { onError } } });
        await expect(wrapped()).rejects.toThrow(boom);
        expect(onError).toHaveBeenCalledWith({ error: boom, classOrMethodName: 'fails', params: undefined, isClient: undefined, consent: undefined, formattedMessage: expect.stringContaining('[fails] Error:') });
    });

    it('does not report when enable is false, but still rethrows', async () => {
        const onError = vi.fn();
        const boom = new Error('boom');
        const wrapped = withErrorHandling(() => { throw boom; }, 'fails', { config: { errorHandling: { enable: false, onError } } });
        await expect(wrapped()).rejects.toThrow(boom);
        expect(onError).not.toHaveBeenCalled();
    });

    it('backgrounds the report via ctx.waitUntil when generate.getCloudflareContext resolves one', async () => {
        const onError = vi.fn();
        const waitUntil = vi.fn();
        const boom = new Error('boom');
        const getCloudflareContext = vi.fn(() => ({ ctx: { waitUntil } }));
        const wrapped = withErrorHandling(() => { throw boom; }, 'fails', {
            config: { errorHandling: { onError }, generate: { getCloudflareContext: getCloudflareContext as never } },
        });
        await expect(wrapped()).rejects.toThrow(boom);
        expect(getCloudflareContext).toHaveBeenCalledWith({ async: false });
        expect(waitUntil).toHaveBeenCalled();
    });
});
