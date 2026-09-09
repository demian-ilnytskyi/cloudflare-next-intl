import { resolveEmailBinding } from './resolve_email_binding.js';
import reportError from '../error_handling/report_error.js';
function isUsableCredential(value) {
    return value.length > 0 && !value.includes('$(');
}
async function sendOverRest(message, options, reportAs) {
    const accountId = (options.restAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
    const token = (options.restToken ?? process.env.CLOUDFLARE_EMAIL_TOKEN ?? '').trim();
    if (!isUsableCredential(accountId) || !isUsableCredential(token))
        return 'unavailable';
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
export async function sendTransactionalEmail(message, options, reportAs) {
    try {
        const binding = await resolveEmailBinding(options.generate, options.bindingName);
        const fullMessage = { ...message, from: options.senderAddress };
        if (binding) {
            await binding.send(fullMessage);
            return 'sent';
        }
        return await sendOverRest(fullMessage, options, reportAs);
    }
    catch (error) {
        await reportError(options, { error, classOrMethodName: reportAs });
        return 'failed';
    }
}
