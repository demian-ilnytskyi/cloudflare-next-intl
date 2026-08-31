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
