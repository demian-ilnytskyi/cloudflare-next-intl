import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
export interface ReportErrorConfig {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: GenerateRoutingConfig;
}
export declare const consoleOverrideState: {
    active: boolean;
};
/**
 * Reports `params`: logs `params.formattedMessage` via `console.error`
 * (unless `config.errorHandling.logToConsole` is `false`, or
 * `installConsoleErrorOverride` is active — in which case IT already did
 * the console logging before calling this) AND calls
 * `config.errorHandling.onError` when set — both run, not one instead of
 * the other, so wiring `onError` (Sentry, Telegram, etc) never silently
 * loses the console output. Skips reporting entirely when
 * `config.errorHandling.enable === false`, `params.consent` is set and not
 * `true` (reporting to a third party without cookie consent can itself be
 * GDPR-relevant), or dedup throttles it (on by default — see
 * `errorHandling.dedup`/`throttleMs`/`resetDedup`). Never throws — a broken
 * `onError` must not mask the original error (falls back to logging via
 * `console.error` instead, when the override isn't already handling that).
 *
 * Always overwrites `params.formattedMessage` with a fresh
 * `formatErrorMessage(params)` before reporting — a human-readable one-line
 * summary (`[classOrMethodName] Error: <message>` plus non-empty sections)
 * instead of the raw `error`/`params` object, for a default reporter (or a
 * simple `onError`) to print directly.
 *
 * When `config.generate?.getCloudflareContext` is set AND `params.isClient`
 * is not `true`, `waitUntil` is called SYNCHRONOUSLY, in the same tick, with
 * the `callOnError(...)` promise — Cloudflare Workers only extends the
 * request's lifetime for work already registered with `waitUntil` by the
 * time the handler returns; deferring that call through an extra microtask
 * (e.g. `Promise.resolve().then(...)`) risks the isolate tearing down the
 * request before `waitUntil` is ever actually invoked, silently dropping
 * the report. `getCloudflareContext` is never called at all for a
 * client-originated report (`params.isClient: true`) — it only exists
 * server-side inside a Cloudflare Worker and throws synchronously (not a
 * rejected promise) when called anywhere else, including the browser.
 * Falls back to awaiting `onError` directly when `getCloudflareContext`/
 * `ctx.waitUntil` is unset, unavailable (e.g. outside a Cloudflare Worker),
 * or skipped for a client report.
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
