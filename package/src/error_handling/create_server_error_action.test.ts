import { describe, it, expect, vi } from 'vitest';
import createServerErrorAction from './create_server_error_action';

describe('createServerErrorAction', () => {
    it('reports the error via reportError, stringified and marked isClient: true', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('Error: boom'),
            classOrMethodName: 'ClientComponent',
            isClient: true,
        }));
    });

    it('passes params through when provided', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent', { key: 'value' });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ params: { key: 'value' } }));
    });

    it('stringifies the error before crossing the action boundary (no live function/Error instance retained)', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        const reportedError = onError.mock.calls[0][0].error;
        expect(typeof reportedError).toBe('string');
    });
});
