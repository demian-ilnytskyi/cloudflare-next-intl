import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import reportClientError from './report_client_error_action.js';
import { setErrorHandlingActionConfig } from './error_handling_action_config.js';

const headerValues = new Map<string, string>();
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => headerValues.get(name) ?? null,
    })),
}));

/** Every case below gets its own name and `dedup: false`, so the shared
 * dedup/throttle state in `reportError` (module-scope, on by default)
 * can never suppress one test's report because an earlier test reported
 * the same-looking error/classOrMethodName pair within the throttle
 * window. */
function configWithOnError(onError: (params: unknown) => void, extra: Record<string, unknown> = {}): {
    errorHandling: { onError: (params: unknown) => void; dedup: false } & Record<string, unknown>;
} {
    return { errorHandling: { onError, dedup: false, ...extra } };
}

describe('reportClientError (ready-made action)', () => {
    beforeEach(() => {
        headerValues.clear();
    });

    afterEach(() => {
        setErrorHandlingActionConfig(undefined);
    });

    it('reports through the config registered via setErrorHandlingActionConfig', async () => {
        const onError = vi.fn();
        setErrorHandlingActionConfig(configWithOnError(onError));

        await reportClientError(new Error('boom'), 'ClientComponent-basic');

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('Error: boom'),
            classOrMethodName: 'ClientComponent-basic',
            isClient: true,
        }));
    });

    it('does nothing (no throw) when no config was ever registered', async () => {
        await expect(reportClientError(new Error('boom'), 'ClientComponent-noconfig')).resolves.toBeUndefined();
    });

    it('does nothing (no throw) when the registered config has no errorHandling slice', async () => {
        setErrorHandlingActionConfig({});
        await expect(reportClientError(new Error('boom'), 'ClientComponent-emptyconfig')).resolves.toBeUndefined();
    });

    it('picks up a later registration (module-scope state, not bound at import time)', async () => {
        const first = vi.fn();
        const second = vi.fn();
        setErrorHandlingActionConfig(configWithOnError(first));
        setErrorHandlingActionConfig(configWithOnError(second));

        await reportClientError(new Error('boom'), 'ClientComponent-reregister');

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('goes back to no-op once the config is cleared with undefined', async () => {
        const onError = vi.fn();
        setErrorHandlingActionConfig(configWithOnError(onError));
        setErrorHandlingActionConfig(undefined);

        await reportClientError(new Error('boom'), 'ClientComponent-cleared');

        expect(onError).not.toHaveBeenCalled();
    });

    describe('error value formatting', () => {
        it.each<[string, unknown, string]>([
            ['a real Error', new Error('boom'), 'Error: boom'],
            ['a string', 'plain string thrown', 'plain string thrown'],
            ['a number', 42, '42'],
            ['a boolean', false, 'false'],
            ['null', null, 'null'],
            ['undefined', undefined, 'undefined'],
            ['a plain object', { code: 'E_BOOM' }, '"code": "E_BOOM"'],
        ])('formats %s correctly', async (_label, value, expectedSubstring) => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(value, `ClientComponent-format-${_label.replace(/\s+/g, '_')}`);

            expect(onError).toHaveBeenCalledTimes(1);
            const reported = onError.mock.calls[0][0];
            expect(typeof reported.error).toBe('string');
            expect(reported.error).toContain(expectedSubstring);
        });

        it('formats an Error subclass with its own name', async () => {
            class ValidationError extends Error {
                constructor(message: string) {
                    super(message);
                    this.name = 'ValidationError';
                }
            }
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new ValidationError('bad input'), 'ClientComponent-subclass');

            expect(onError.mock.calls[0][0].error).toContain('ValidationError: bad input');
        });

        it('never retains a live Error instance — the reported error is always a string', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-stringified');

            expect(typeof onError.mock.calls[0][0].error).toBe('string');
        });

        it('resolves a circular object to a safe placeholder instead of throwing', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));
            const circular: Record<string, unknown> = { a: 1 };
            circular.self = circular;

            await expect(reportClientError(circular, 'ClientComponent-circular')).resolves.toBeUndefined();
            expect(onError).toHaveBeenCalledTimes(1);
            expect(typeof onError.mock.calls[0][0].error).toBe('string');
        });

        it('resolves an unresolved React internal reference stub instead of throwing across the action boundary', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));
            const reactInternalReference = Object.assign(() => { throw new Error('should never be called'); }, {
                $$typeof: Symbol.for('react.server.reference'),
            });

            await reportClientError(reactInternalReference, 'ClientComponent-reactref');

            expect(onError).toHaveBeenCalledWith(expect.objectContaining({
                error: '[React internal reference could not be resolved to a value]',
            }));
        });
    });

    describe('params handling', () => {
        it('attaches requestContext even when no params are provided', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-noparams');

            expect(onError.mock.calls[0][0].params).toEqual({ requestContext: {} });
        });

        it('merges an object params with requestContext instead of replacing it', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-objectparams', { userId: 'u1' });

            expect(onError.mock.calls[0][0].params).toEqual({ userId: 'u1', requestContext: {} });
        });

        it('nests a non-object params (string) instead of dropping it', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-stringparams', 'a plain string param');

            expect(onError.mock.calls[0][0].params).toEqual({ params: 'a plain string param', requestContext: {} });
        });

        it('nests a non-object params (array) instead of merging into requestContext', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-arrayparams', ['a', 'b']);

            expect(onError.mock.calls[0][0].params).toEqual({ params: ['a', 'b'], requestContext: {} });
        });

        it('treats explicit null params as a non-object value, not as "no params"', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-nullparams', null);

            expect(onError.mock.calls[0][0].params).toEqual({ params: null, requestContext: {} });
        });
    });

    describe('requestContext from headers', () => {
        it('attaches path/userAgent/referer from request headers when available', async () => {
            headerValues.set('x-pathname', '/some/page');
            headerValues.set('user-agent', 'test-agent');
            headerValues.set('referer', 'https://example.com');
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-headers');

            expect(onError.mock.calls[0][0].params).toEqual({
                requestContext: {
                    path: '/some/page',
                    userAgent: 'test-agent',
                    referer: 'https://example.com',
                },
            });
        });

        it('falls back to an empty requestContext when next/headers throws', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('no request scope'));
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await expect(reportClientError(new Error('boom'), 'ClientComponent-headersthrow')).resolves.toBeUndefined();
            expect(onError.mock.calls[0][0].params).toEqual({ requestContext: {} });
        });

        it('omits an individual header instead of throwing when only some are present', async () => {
            headerValues.set('x-pathname', '/only-path');
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));

            await reportClientError(new Error('boom'), 'ClientComponent-partialheaders');

            expect(onError.mock.calls[0][0].params).toEqual({ requestContext: { path: '/only-path' } });
        });
    });

    describe('resilience — a broken sink must never break the caller', () => {
        it('does not throw and still logs to console when onError itself throws', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const onError = vi.fn(() => { throw new Error('sink is down'); });
            setErrorHandlingActionConfig(configWithOnError(onError));

            await expect(reportClientError(new Error('boom'), 'ClientComponent-sinkthrows')).resolves.toBeUndefined();
            expect(onError).toHaveBeenCalledTimes(1);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('does not throw and still logs to console when onError itself rejects', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const onError = vi.fn(() => Promise.reject(new Error('sink is down')));
            setErrorHandlingActionConfig(configWithOnError(onError));

            await expect(reportClientError(new Error('boom'), 'ClientComponent-sinkrejects')).resolves.toBeUndefined();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('never throws even when both error and params are unserializable circular structures', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig(configWithOnError(onError));
            const circularError: Record<string, unknown> = { message: 'boom' };
            circularError.self = circularError;
            const circularParams: Record<string, unknown> = { tag: 'ctx' };
            circularParams.self = circularParams;

            await expect(
                reportClientError(circularError, 'ClientComponent-doublecircular', circularParams),
            ).resolves.toBeUndefined();
            expect(onError).toHaveBeenCalledTimes(1);
        });
    });

    describe('respects the registered config, not just onError', () => {
        it('skips reporting entirely when errorHandling.enable is false', async () => {
            const onError = vi.fn();
            setErrorHandlingActionConfig({ errorHandling: { onError, enable: false } });

            await reportClientError(new Error('boom'), 'ClientComponent-disabled');

            expect(onError).not.toHaveBeenCalled();
        });

        it('is marked isClient: true regardless of config, so server-only paths (waitUntil, getCloudflareContext) are skipped', async () => {
            const onError = vi.fn();
            const getCloudflareContext = vi.fn();
            setErrorHandlingActionConfig({
                errorHandling: { onError, dedup: false },
                generate: { getCloudflareContext },
            });

            await reportClientError(new Error('boom'), 'ClientComponent-isclient');

            expect(onError).toHaveBeenCalledWith(expect.objectContaining({ isClient: true }));
            expect(getCloudflareContext).not.toHaveBeenCalled();
        });
    });
});
