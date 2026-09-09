import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./resolve_email_binding.js', () => ({ resolveEmailBinding: vi.fn() }));
vi.mock('../error_handling/report_error.js', () => ({ default: vi.fn() }));

import { resolveEmailBinding } from './resolve_email_binding.js';
import reportError from '../error_handling/report_error.js';
import { sendTransactionalEmail } from './send_transactional_email.js';

const message = { to: 'user@example.com', subject: 'Hi', text: 'hi', html: '<p>hi</p>' };
const baseOptions = { senderAddress: 'no-reply@example.com' };

describe('sendTransactionalEmail', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        globalThis.fetch = vi.fn();
        process.env.CLOUDFLARE_ACCOUNT_ID = '';
        process.env.CLOUDFLARE_EMAIL_TOKEN = '';
        vi.mocked(reportError).mockClear();
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it('sends via the binding when one is available, and returns "sent"', async () => {
        const send = vi.fn(async () => undefined);
        vi.mocked(resolveEmailBinding).mockResolvedValue({ send });

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(send).toHaveBeenCalledWith({ ...message, from: 'no-reply@example.com' });
        expect(outcome).toBe('sent');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('returns "unavailable" when no binding and no REST credentials are configured', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('unavailable');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('treats an unexpanded shell macro ("$(...)") as not configured', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
        process.env.CLOUDFLARE_EMAIL_TOKEN = '$(op read op://vault/item/token)';
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('unavailable');
    });

    it('sends over REST when credentials are configured, and returns "sent" on a 2xx', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
        process.env.CLOUDFLARE_EMAIL_TOKEN = 'tok-1';
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(outcome).toBe('sent');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/acct-1/email/sending/send',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('reports and returns "failed" on a non-ok REST response', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
        process.env.CLOUDFLARE_EMAIL_TOKEN = 'tok-1';
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 500 }));

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(outcome).toBe('failed');
        expect(reportError).toHaveBeenCalledTimes(1);
    });

    it('sends over REST using restAccountId/restToken options instead of env vars', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));

        const outcome = await sendTransactionalEmail(message, { ...baseOptions, restAccountId: 'opt-acct', restToken: 'opt-tok' }, 'test.send');

        expect(outcome).toBe('sent');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/opt-acct/email/sending/send',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns "unavailable" when the env vars are entirely unset (not just empty)', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        delete process.env.CLOUDFLARE_EMAIL_TOKEN;

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(outcome).toBe('unavailable');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('reports and returns "failed" when the binding throws — never throws itself', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue({ send: vi.fn(async () => { throw new Error('boom'); }) });
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('failed');
        expect(reportError).toHaveBeenCalledTimes(1);
    });
});
