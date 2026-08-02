import type { ErrorHandlingParams } from '../types/types';
import { type ReportErrorConfig } from './report_error';
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
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function createServerErrorAction(config: ReportErrorConfig | undefined): (error: unknown, classOrMethodName: string, params?: ErrorHandlingParams["params"]) => Promise<void>;
