import { describe, it, expect, vi, beforeEach } from 'vitest';
import createServerErrorAction from './create_server_error_action';

const headerValues = new Map<string, string>();
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => headerValues.get(name) ?? null,
    })),
}));

describe('createServerErrorAction', () => {
    beforeEach(() => {
        headerValues.clear();
    });

    it('attaches path/userAgent/referer from request headers when available', async () => {
        headerValues.set('x-pathname', '/some/page');
        headerValues.set('user-agent', 'test-agent');
        headerValues.set('referer', 'https://example.com');
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            params: {
                requestContext: {
                    path: '/some/page',
                    userAgent: 'test-agent',
                    referer: 'https://example.com',
                },
            },
        }));
    });

    it('falls back to an empty requestContext when next/headers throws', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockRejectedValueOnce(new Error('no request scope'));
        const onError = vi.fn();
        const reportClientError = createServerErrorAction({ errorHandling: { onError } });
        await reportClientError(new Error('boom'), 'ClientComponent');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            params: { requestContext: {} },
        }));
    });
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
