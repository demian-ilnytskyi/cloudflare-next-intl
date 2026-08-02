import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types';
export interface ReportErrorConfig {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: GenerateRoutingConfig;
}
/**
 * Reports `params` via `config.errorHandling.onError` (default
 * `console.error(params.formattedMessage)`), unless
 * `config.errorHandling.enable === false`, `params.consent` is set and not
 * `true` (reporting to a third party without cookie consent can itself be
 * GDPR-relevant), or dedup throttles it (on by default — see
 * `errorHandling.dedup`/`throttleMs`/`resetDedup`). Never throws — a broken
 * reporter must not mask the original error.
 *
 * Always overwrites `params.formattedMessage` with a fresh
 * `formatErrorMessage(params)` before reporting — a human-readable one-line
 * summary (`[classOrMethodName] Error: <message>` plus non-empty sections)
 * instead of the raw `error`/`params` object, for a default reporter (or a
 * simple `onError`) to print directly.
 *
 * When `config.generate?.getCloudflareContext` is set, `waitUntil` is called
 * SYNCHRONOUSLY, in the same tick, with the `callOnError(...)` promise —
 * Cloudflare Workers only extends the request's lifetime for work already
 * registered with `waitUntil` by the time the handler returns; deferring
 * that call through an extra microtask (e.g. `Promise.resolve().then(...)`)
 * risks the isolate tearing down the request before `waitUntil` is ever
 * actually invoked, silently dropping the report. Falls back to awaiting
 * `onError` directly when `getCloudflareContext`/`ctx.waitUntil` is unset or
 * unavailable (e.g. outside a Cloudflare Worker).
 *
 * Passing `params.error` as `null`/`undefined` with `errorHandling.resetDedup: true`
 * and nothing else is a valid "reset-only" call: the dedup state clears and
 * `reportError` returns immediately, without calling `onError` — useful to
 * clear dedup state once at the very start of a request/cron tick, before
 * any handler that might call `reportError` for a real error runs.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function reportError(config: ReportErrorConfig | undefined, params: ErrorHandlingParams): Promise<void>;
