export type TurnstileVerdict = 'ok' | 'rejected' | 'unavailable';

interface TurnstileSiteverifyResponse {
    success: boolean;
    action?: string;
    'error-codes'?: string[];
}

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export default async function verifyTurnstileToken(
    secret: string,
    token: string,
    expectedAction: string,
): Promise<TurnstileVerdict> {
    try {
        const body = new FormData();
        body.append('secret', secret);
        body.append('response', token);
        body.append('idempotency_key', crypto.randomUUID());

        const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
            method: 'POST',
            body,
            signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });

        if (!res.ok) {
            return 'unavailable';
        }

        const data = (await res.json()) as TurnstileSiteverifyResponse;

        if (data.success !== true || data.action !== expectedAction) {
            return 'rejected';
        }

        return 'ok';
    } catch {
        return 'unavailable';
    }
}
