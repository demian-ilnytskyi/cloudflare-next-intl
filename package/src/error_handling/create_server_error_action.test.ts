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

    it('passes params through when provided, merged with requestContext', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent', { key: 'value' });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            params: expect.objectContaining({ key: 'value', requestContext: expect.any(Object) }),
        }));
    });

    it('attaches requestContext even when no params are provided', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            params: { requestContext: expect.any(Object) },
        }));
    });

    it('nests non-object params instead of dropping them', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent', 'a plain string param');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            params: { params: 'a plain string param', requestContext: expect.any(Object) },
        }));
    });

    it('stringifies the error before crossing the action boundary (no live function/Error instance retained)', async () => {
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        const reportedError = onError.mock.calls[0][0].error;
        expect(typeof reportedError).toBe('string');
    });
});
