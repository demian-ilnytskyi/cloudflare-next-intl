// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('verifyTurnstileToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns "ok" when siteverify succeeds and action matches expectedAction', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ success: true, action: 'fire_app_check' }),
        });

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'test-token', 'fire_app_check');

        expect(verdict).toBe('ok');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        expect(init.method).toBe('POST');
        expect(init.signal).toBeDefined();

        const body = init.body;
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('secret')).toBe('test-secret');
        expect(body.get('response')).toBe('test-token');
        expect(body.get('idempotency_key')).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
    });

    it('returns "rejected" when success is false', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
        });

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'bad-token', 'fire_app_check');

        expect(verdict).toBe('rejected');
    });

    it('returns "rejected" when action does not match expectedAction', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ success: true, action: 'other_action' }),
        });

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'test-token', 'fire_app_check');

        expect(verdict).toBe('rejected');
    });

    it('returns "unavailable" on non-200 HTTP status', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        });

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'test-token', 'fire_app_check');

        expect(verdict).toBe('unavailable');
    });

    it('returns "unavailable" when fetch throws a network or timeout error', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'));

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'test-token', 'fire_app_check');

        expect(verdict).toBe('unavailable');
    });

    it('returns "unavailable" when response JSON parsing fails', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error('Invalid JSON');
            },
        });

        const { default: verifyTurnstileToken } = await import('./verify_turnstile_token.js');
        const verdict = await verifyTurnstileToken('test-secret', 'test-token', 'fire_app_check');

        expect(verdict).toBe('unavailable');
    });
});
