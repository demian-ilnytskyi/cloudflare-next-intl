import { describe, it, expect, vi } from 'vitest';
import reportError from './report_error';

describe('reportError perf characteristics', () => {
    it('does not call getCloudflareContext at all when it is unset (no wasted context resolution)', async () => {
        const onError = vi.fn();
        await reportError({ errorHandling: { onError } }, { error: new Error('boom'), classOrMethodName: 'foo' });
        expect(onError).toHaveBeenCalled();
    });

    it('does not call onError/format the message at all when enable is false (short-circuits before any work)', async () => {
        const onError = vi.fn();
        const getCloudflareContext = vi.fn();
        await reportError(
            { errorHandling: { enable: false, onError }, generate: { getCloudflareContext: getCloudflareContext as never } },
            { error: new Error('boom'), classOrMethodName: 'foo' },
        );
        expect(onError).not.toHaveBeenCalled();
        expect(getCloudflareContext).not.toHaveBeenCalled();
    });

    it('does not call onError/getCloudflareContext when consent gate fails (short-circuits before any work)', async () => {
        const onError = vi.fn();
        const getCloudflareContext = vi.fn();
        await reportError(
            { errorHandling: { onError }, generate: { getCloudflareContext: getCloudflareContext as never } },
            { error: new Error('boom'), classOrMethodName: 'foo', consent: false },
        );
        expect(onError).not.toHaveBeenCalled();
        expect(getCloudflareContext).not.toHaveBeenCalled();
    });

    it('never awaits onError when ctx.waitUntil is available (report is backgrounded, call returns immediately)', async () => {
        let resolved = false;
        const onError = () => new Promise<void>((resolve) => setTimeout(() => { resolved = true; resolve(); }, 20));
        const waitUntil = vi.fn();
        const getCloudflareContext = (() => ({ ctx: { waitUntil } })) as never;
        await reportError(
            { errorHandling: { onError }, generate: { getCloudflareContext } },
            { error: new Error('boom'), classOrMethodName: 'foo' },
        );
        expect(waitUntil).toHaveBeenCalled();
        expect(resolved).toBe(false);
    });

    it('calls waitUntil synchronously with the task promise, in the same tick as reportError — no extra microtask hop before the runtime is told to extend the request lifetime', async () => {
        const onError = vi.fn();
        const waitUntil = vi.fn();
        const getCloudflareContext = (() => ({ ctx: { waitUntil } })) as never;
        const promise = reportError(
            { errorHandling: { onError }, generate: { getCloudflareContext } },
            { error: new Error('boom'), classOrMethodName: 'foo' },
        );
        // Checked BEFORE awaiting — waitUntil must already have been called
        // by the time reportError's own synchronous execution finishes,
        // not after some later microtask.
        expect(waitUntil).toHaveBeenCalledTimes(1);
        expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
        await promise;
    });

    it('calls getCloudflareContext with { async: false } (sync overload, no unnecessary Promise wrapping)', async () => {
        const getCloudflareContext = vi.fn(() => null);
        await reportError(
            { generate: { getCloudflareContext: getCloudflareContext as never } },
            { error: new Error('boom'), classOrMethodName: 'foo' },
        );
        expect(getCloudflareContext).toHaveBeenCalledWith({ async: false });
        expect(getCloudflareContext).toHaveBeenCalledTimes(1);
    });
});
