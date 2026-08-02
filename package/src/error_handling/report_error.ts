import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types';
import formatErrorMessage from './format_error_message';

export interface ReportErrorConfig {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: GenerateRoutingConfig;
}

async function callOnError(config: ErrorHandlingRoutingConfig | undefined, params: ErrorHandlingParams): Promise<void> {
    const paramsWithFormattedMessage: ErrorHandlingParams = { ...params, formattedMessage: formatErrorMessage(params) };
    try {
        if (config?.onError) {
            await config.onError(paramsWithFormattedMessage);
        } else {
            console.error(paramsWithFormattedMessage.formattedMessage);
        }
    } catch {
        console.error(paramsWithFormattedMessage.formattedMessage);
    }
}

/**
 * Reports `params` via `config.errorHandling.onError` (default
 * `console.error(params.formattedMessage)`), unless
 * `config.errorHandling.enable === false` or `params.consent` is set and
 * not `true` (reporting to a third party without cookie consent can itself
 * be GDPR-relevant). Never throws — a broken reporter must not mask the
 * original error.
 *
 * Always overwrites `params.formattedMessage` with a fresh
 * `formatErrorMessage(params)` before reporting — a human-readable one-line
 * summary (`[classOrMethodName] Error: <message>` plus non-empty sections)
 * instead of the raw `error`/`params` object, for a default reporter (or a
 * simple `onError`) to print directly.
 *
 * No built-in dedup/throttling: this package has no per-request context to
 * safely scope such state to (module-scope state would leak across
 * concurrent requests in a long-lived server process). Do dedup/throttling
 * in your own `onError` if you need it, scoped to your own request context.
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
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default async function reportError(
    config: ReportErrorConfig | undefined,
    params: ErrorHandlingParams,
): Promise<void> {
    const errorHandling = config?.errorHandling;
    if (errorHandling?.enable === false) return;
    if (params.consent !== undefined && params.consent !== true) return;

    const waitUntil = config?.generate?.getCloudflareContext?.({ async: false })?.ctx?.waitUntil;
    if (waitUntil) {
        waitUntil(callOnError(errorHandling, params));
        return;
    }
    await callOnError(errorHandling, params);
}
