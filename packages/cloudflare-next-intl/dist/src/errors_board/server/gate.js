import { getAuthUser } from '../../firebase_auth/server/use_auth_user_server.js';
export function createRequireErrorsAccess(options) {
    const allowedEmailsLower = Array.isArray(options.allowedEmails)
        ? new Set(options.allowedEmails.map((email) => email.toLowerCase()))
        : null;
    const isAllowed = allowedEmailsLower
        ? (email) => allowedEmailsLower.has((email ?? '').toLowerCase())
        : options.allowedEmails;
    return async function requireErrorsAccess() {
        const { user } = await getAuthUser();
        if (isAllowed(user?.email ?? null))
            return;
        if (options.onDenied) {
            await options.onDenied();
            return;
        }
        const { notFound } = await import('next/navigation.js');
        notFound();
    };
}
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function createPasswordErrorsAccess(options) {
    const cookieName = options.cookieName ?? 'errors_auth';
    const cookiePath = options.cookiePath ?? '/errors';
    const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 30;
    async function expectedCookieValue() {
        return sha256Hex(options.password);
    }
    async function hasAccess() {
        const { cookies } = await import('next/headers.js');
        const store = await cookies();
        const value = store.get(cookieName)?.value;
        if (!value)
            return false;
        return value === (await expectedCookieValue());
    }
    return {
        hasAccess,
        async requireAccess() {
            if (await hasAccess())
                return;
            if (options.onDenied) {
                await options.onDenied();
                return;
            }
            const { notFound } = await import('next/navigation.js');
            notFound();
        },
        async verifyPassword(password) {
            return password === options.password;
        },
        async setAuthCookie() {
            const { cookies } = await import('next/headers.js');
            const store = await cookies();
            store.set(cookieName, await expectedCookieValue(), {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: cookiePath,
                maxAge,
            });
        },
    };
}
