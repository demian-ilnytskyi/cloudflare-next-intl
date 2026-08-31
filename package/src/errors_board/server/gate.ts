import { getAuthUser } from '../../firebase_auth/server/use_auth_user_server.js';

export interface ErrorsAccessOptions {
    /** A fixed allowlist, or a predicate for something more dynamic (a domain suffix, a role claim lookup, etc). */
    allowedEmails: readonly string[] | ((email: string | null) => boolean);
    /** Called instead of `notFound()` on denial — e.g. to redirect somewhere else instead. Defaults to Next's `notFound()`, matching `clarivant/CRV/src/app/errors/gate.ts`'s "don't advertise the route" behavior. */
    onDenied?: () => void | Promise<void>;
}

/**
 * Builds a `requireErrorsAccess()` guard, reusing this package's own
 * signed-in Firebase session (`getAuthUser`) rather than a separate
 * shared-password cookie — same approach as
 * `clarivant/CRV/src/app/errors/gate.ts`. Re-export the returned function
 * from your own `gate.ts` and call it at the top of your `page.tsx`/
 * `actions.ts`.
 */
export function createRequireErrorsAccess(options: ErrorsAccessOptions): () => Promise<void> {
    const allowedEmailsLower = Array.isArray(options.allowedEmails)
        ? new Set(options.allowedEmails.map((email) => email.toLowerCase()))
        : null;
    const isAllowed = allowedEmailsLower
        ? (email: string | null) => allowedEmailsLower.has((email ?? '').toLowerCase())
        : (options.allowedEmails as (email: string | null) => boolean);

    return async function requireErrorsAccess(): Promise<void> {
        const { user } = await getAuthUser();
        if (isAllowed(user?.email ?? null)) return;

        if (options.onDenied) {
            await options.onDenied();
            return;
        }
        const { notFound } = await import('next/navigation');
        notFound();
    };
}

async function sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface PasswordErrorsAccessOptions {
    /** The shared secret to compare submitted passwords against. Read it from your own env/secret store and pass it in — this doesn't reach into `process.env` for you. */
    password: string;
    /** Defaults to `'errors_auth'`. */
    cookieName?: string;
    /** Defaults to `'/errors'`. */
    cookiePath?: string;
    /** Defaults to 30 days. */
    maxAgeSeconds?: number;
    /** Called instead of `notFound()` from `requireAccess()` on denial — e.g. to redirect somewhere else instead. */
    onDenied?: () => void | Promise<void>;
}

export interface PasswordErrorsAccess {
    /** Whether the current request's cookie matches — never throws, safe to call from a page component to decide "show the login form or the board". */
    hasAccess(): Promise<boolean>;
    /** Throws via Next's `notFound()` (or calls `onDenied`) when access is missing. Same shape as `createRequireErrorsAccess`'s return, so it slots into `createErrorsActions({ requireAccess })` unchanged. */
    requireAccess(): Promise<void>;
    /** Checks a submitted password against the configured secret. Doesn't set the cookie — call `setAuthCookie` yourself after this returns `true`. */
    verifyPassword(password: string): Promise<boolean>;
    /** Sets the auth cookie for the current request. Call this from a `"use server"` login action after `verifyPassword` succeeds. */
    setAuthCookie(): Promise<void>;
}

/**
 * Builds a shared-password `requireErrorsAccess()` guard for apps that
 * don't have Firebase Auth (or a per-user sign-in flow) wired up at all —
 * `createRequireErrorsAccess`'s `getAuthUser()` check would otherwise be
 * unsatisfiable and lock every admin out. Same shared-secret-cookie
 * approach as the reference implementation this board was ported from
 * (`portfolio/src/app/errors/gate.ts`): a SHA-256 hash of the password in
 * an httpOnly cookie scoped to `cookiePath`, checked on every request —
 * never comparing the raw password against a stored cookie value.
 */
export function createPasswordErrorsAccess(options: PasswordErrorsAccessOptions): PasswordErrorsAccess {
    const cookieName = options.cookieName ?? 'errors_auth';
    const cookiePath = options.cookiePath ?? '/errors';
    const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 30;

    async function expectedCookieValue(): Promise<string> {
        return sha256Hex(options.password);
    }

    async function hasAccess(): Promise<boolean> {
        const { cookies } = await import('next/headers');
        const store = await cookies();
        const value = store.get(cookieName)?.value;
        if (!value) return false;
        return value === (await expectedCookieValue());
    }

    return {
        hasAccess,
        async requireAccess(): Promise<void> {
            if (await hasAccess()) return;
            if (options.onDenied) {
                await options.onDenied();
                return;
            }
            const { notFound } = await import('next/navigation');
            notFound();
        },
        async verifyPassword(password: string): Promise<boolean> {
            return password === options.password;
        },
        async setAuthCookie(): Promise<void> {
            const { cookies } = await import('next/headers');
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
