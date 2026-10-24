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

/**
 * Gated form of {@link resolveOptionalAuthUser} for an `onError` sink that
 * wants to attach the reporting user only when the call site that reported
 * the error opted in — pass `ErrorHandlingParams.useAuthUser` straight
 * through. Defaults to `false`: when `useAuthUser` isn't `true`, this
 * resolves `{ user: null }` immediately, without calling `getAuthUser()` at
 * all — no `cookies()` read happens on that request, so a page reached only
 * through this path (never through the `useAuthUser: true` case) stays
 * invisible to `checkDynamicPages`'s dynamic-API scan.
 *
 * A caller that already knows its page is dynamic (or isn't a page render
 * at all — a Server Action, a route handler) loses nothing by passing
 * `useAuthUser: true`; a caller reached from a static page should leave it
 * `false` (the default) to keep that page static.
 *
 * @example
 * ```ts
 * // app on_error.ts sink
 * const { user } = await resolveErrorReportingUser(params.useAuthUser);
 * const userEmail = user?.email ?? null;
 * ```
 */
export async function resolveErrorReportingUser(useAuthUser?: boolean): Promise<{ user: User | null }> {
    if (useAuthUser !== true) return { user: null };
    return resolveOptionalAuthUser();
}
