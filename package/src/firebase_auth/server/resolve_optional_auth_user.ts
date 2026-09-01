import type { User } from '@firebase/auth';
import { getAuthUser } from './use_auth_user_server.js';

/**
 * Best-effort variant of {@link getAuthUser} for callers that want to
 * *attach* the current user when one happens to be known — error/telemetry
 * reporting, analytics, logging — but must never fail or change behavior
 * because no request/session context is available (a `waitUntil`-deferred
 * callback, a build-time prerender pass, a background job). Swallows every
 * failure and resolves `{ user: null }` instead.
 *
 * Prefer {@link getAuthUser} whenever the caller's own output actually
 * depends on who's signed in (the page renders differently for them, a
 * query is scoped to their id, ...) — that dependency is real and should be
 * visible to any dynamic-rendering analysis. This helper is for the
 * opposite case: the read is optional decoration on an otherwise
 * unrelated response, most commonly inside an error-reporting hook (see
 * `cloudflare-next-intl/errorHandling`) that tags a report with "whoever
 * was signed in, if anyone" without ever gating the reported page's own
 * content on it.
 */
export default async function resolveOptionalAuthUser(): Promise<{ user: User | null }> {
    try {
        const { user } = await getAuthUser();
        return { user };
    } catch {
        return { user: null };
    }
}
