import { resolveEmailBinding } from './resolve_email_binding.js';
import reportError, { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/** `sent` — the provider accepted it. `unavailable` — nothing is configured to send with. `failed` — an attempt was made and lost. */
export type TransactionalEmailOutcome = 'sent' | 'unavailable' | 'failed';

export interface TransactionalEmailContent {
    subject: string;
    text: string;
    html: string;
}

export interface SendTransactionalEmailOptions extends ReportErrorConfig {
    generate?: GenerateRoutingConfig;
    /** No default — Cloudflare Email Sending only accepts a `From` on a domain you've verified, so a hardcoded default here would silently fail for every consumer but one. */
    senderAddress: string;
    /** Defaults to `'EMAIL'`, matching `wrangler.toml`'s `[[send_email]]` binding name convention. */
    bindingName?: string;
    /** Defaults to `process.env.CLOUDFLARE_ACCOUNT_ID` — the local-dev REST fallback's account id. */
    restAccountId?: string;
    /** Defaults to `process.env.CLOUDFLARE_EMAIL_TOKEN` — the local-dev REST fallback's API token. */
    restToken?: string;
}

function isUsableCredential(value: string): boolean {
    return value.length > 0 && !value.includes('$(');
}

async function sendOverRest(
    message: { to: string; from: string } & TransactionalEmailContent,
    options: SendTransactionalEmailOptions,
    reportAs: string,
): Promise<TransactionalEmailOutcome> {
    const accountId = (options.restAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
    const token = (options.restToken ?? process.env.CLOUDFLARE_EMAIL_TOKEN ?? '').trim();
    if (!isUsableCredential(accountId) || !isUsableCredential(token)) return 'unavailable';

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        await reportError(options, { error: new Error(`email/sending/send responded ${response.status}`), classOrMethodName: `${reportAs}.rest` });
        return 'failed';
    }
    return 'sent';
}

/**
 * Sends `message` via the Cloudflare Email Sending binding when one is
 * available, otherwise via the REST endpoint (needs `restAccountId`/
 * `restToken`, or the matching env vars — the usual case in local dev,
 * where there is no Worker binding). **Never throws** — matches
 * `portfolio/src/shared/email/transactional_email.ts`'s
 * `sendTransactionalEmail`: every caller has already committed whatever row
 * the message is about, so losing that row because the mail hop failed
 * would be worse than not mailing it.
 */
export async function sendTransactionalEmail(
    message: { to: string } & TransactionalEmailContent,
    options: SendTransactionalEmailOptions,
    reportAs: string,
): Promise<TransactionalEmailOutcome> {
    try {
        const binding = await resolveEmailBinding(options.generate, options.bindingName);
        const fullMessage = { ...message, from: options.senderAddress };

        if (binding) {
            await binding.send(fullMessage);
            return 'sent';
        }
        return await sendOverRest(fullMessage, options, reportAs);
    } catch (error) {
        await reportError(options, { error, classOrMethodName: reportAs });
        return 'failed';
    }
}
