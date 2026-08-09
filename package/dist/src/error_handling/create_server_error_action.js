import reportError from './report_error';
import stringifyUnknown from './stringify_unknown';
/**
 * Reads request context (page path, user agent, referer) via `next/headers`
 * for a client-originated error report. `path` comes from `x-pathname`, set
 * by `intlMiddleware` (this package's own middleware) — falls back to
 * `undefined` when a header is missing (e.g. middleware didn't run for this
 * request) rather than throwing.
 */
async function resolveRequestContext() {
    try {
        const { headers } = await import('next/headers');
        const headerList = await headers();
        return {
            path: headerList.get('x-pathname') ?? undefined,
            userAgent: headerList.get('user-agent') ?? undefined,
            referer: headerList.get('referer') ?? undefined,
        };
    }
    catch {
        return {};
    }
}
/**
 * Builds a function that reports a client-originated error via
 * `reportError`, meant to be re-exported directly from your OWN
 * `"use server"` file so `config` (and anything it closes over — secrets,
 * `Secrets.telegramBotToken`-style env reads inside your `onError`) never
 * has to be imported into client-side code:
 *
 * ```ts
 * // report_client_error.ts
 * "use server";
 * import createServerErrorAction from "cloudflare-next-intl/createServerErrorAction";
 * import intlConfig from "./intl_config";
 * export const reportClientError = createServerErrorAction(intlConfig);
 * ```
 *
 * This function itself must NOT be called from a file marked `"use server"`
 * — Next.js requires every top-level export of such a file to be an async
 * function directly; a factory that returns one doesn't qualify. Put
 * `"use server"` in your OWN file (as above), not in a file that calls
 * `createServerErrorAction` and re-exports its result under a different
 * name than a plain `const`.
 *
 * The error is stringified before crossing the client→server action
 * boundary (Next.js server actions serialize arguments; an `Error` instance
 * doesn't survive that intact) and `isClient: true` is set automatically.
 *
 * Also attaches `requestContext: { path, userAgent, referer }` (best-effort,
 * via `next/headers` — see `resolveRequestContext`) alongside your own
 * `params`, so `onError`/the console report shows WHERE the error happened,
 * not just what it was — useful when diagnosing a client error without a
 * repro, since the page and browser are often the missing piece.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function createServerErrorAction(config) {
    return async function reportClientError(error, classOrMethodName, params) {
        const requestContext = await resolveRequestContext();
        const isPlainParamsObject = typeof params === 'object' && params !== null && !Array.isArray(params);
        const mergedParams = params === undefined
            ? { requestContext }
            : isPlainParamsObject
                ? { ...params, requestContext }
                : { params, requestContext };
        await reportError(config, {
            error: stringifyUnknown(error, true),
            classOrMethodName,
            params: mergedParams,
            isClient: true,
        });
    };
}
