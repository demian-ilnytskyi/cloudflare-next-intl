import type { ErrorHandlingParams } from '../types/types.js';
import { type ReportErrorConfig } from './report_error.js';
import { reportClientErrorCore } from './report_client_error_core.js';

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
 * Prefer the package's own ready-made `reportClientError` action (paired
 * with `setErrorHandlingActionConfig`) instead if you don't need config
 * bound per call — it skips this wrapper file entirely.
 *
 * The error is stringified before crossing the client→server action
 * boundary (Next.js server actions serialize arguments; an `Error` instance
 * doesn't survive that intact) and `isClient: true` is set automatically.
 *
 * Also attaches `requestContext: { path, userAgent, referer }` (best-effort,
 * via `next/headers`) alongside your own `params`, so `onError`/the console
 * report shows WHERE the error happened, not just what it was — useful when
 * diagnosing a client error without a repro, since the page and browser are
 * often the missing piece.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function createServerErrorAction(config: ReportErrorConfig | undefined) {
    return async function reportClientError(
        error: unknown,
        classOrMethodName: string,
        params?: ErrorHandlingParams['params'],
    ): Promise<void> {
        await reportClientErrorCore(config, error, classOrMethodName, params);
    };
}
