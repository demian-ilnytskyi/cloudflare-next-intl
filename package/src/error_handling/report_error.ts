import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types';
import formatErrorMessage from './format_error_message';
import stringifyUnknown from './stringify_unknown';

export interface ReportErrorConfig {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: GenerateRoutingConfig;
}

const DEFAULT_THROTTLE_MS = 5000;

// Captured once at module load — BEFORE `installConsoleErrorOverride` can
// ever patch `console.error` — so `callOnError`'s own fallback/always-log
// path calls the real console, never the override. Calling a possibly-
// patched `console.error` here would loop straight back into
// `reportError` (the override's job is to call `reportError`), producing
// a duplicate (or, if `onError` itself throws, an infinite) report.
const originalConsoleError = console.error.bind(console);

// Module-scope dedup state — safe by default only because a fresh JS realm
// (isolate/Worker instance) starts with it cleared. In a long-lived server
// process reused across many requests, pass `resetDedup: true` on the first
// `reportError` call of each request/cron tick, or one request's errors can
// suppress another's.
let lastDedupKey: string | null = null;
let lastReportedAt = 0;

function buildDedupKey(params: ErrorHandlingParams): string {
    return params.dedupKey ?? `${params.classOrMethodName} ${stringifyUnknown(params.error, params.isClient)} ${
        params.params ? stringifyUnknown(params.params, params.isClient) : ''
    }`;
}

async function callOnError(config: ErrorHandlingRoutingConfig | undefined, params: ErrorHandlingParams): Promise<void> {
    const paramsWithFormattedMessage: ErrorHandlingParams = { ...params, formattedMessage: formatErrorMessage(params) };

    if (config?.logToConsole !== false) {
        originalConsoleError(paramsWithFormattedMessage.formattedMessage);
    }

    if (config?.onError) {
        try {
            await config.onError(paramsWithFormattedMessage);
        } catch {
            originalConsoleError(paramsWithFormattedMessage.formattedMessage);
        }
    }
}

/**
 * Reports `params`: logs `params.formattedMessage` via the real
 * `console.error` (unless `config.errorHandling.logToConsole` is `false`)
 * AND calls `config.errorHandling.onError` when set — both run, not one
 * instead of the other, so wiring `onError` (Sentry, Telegram, etc) never
 * silently loses the console output. Skips reporting entirely when
 * `config.errorHandling.enable === false`, `params.consent` is set and not
 * `true` (reporting to a third party without cookie consent can itself be
 * GDPR-relevant), or dedup throttles it (on by default — see
 * `errorHandling.dedup`/`throttleMs`/`resetDedup`). Never throws — a broken
 * `onError` must not mask the original error (falls back to logging via the
 * real console instead).
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
export default async function reportError(
    config: ReportErrorConfig | undefined,
    params: ErrorHandlingParams,
): Promise<void> {
    const errorHandling = config?.errorHandling;
    if (errorHandling?.resetDedup) {
        lastDedupKey = null;
        lastReportedAt = 0;
        if (params.error === null || params.error === undefined) return;
    }

    if (errorHandling?.enable === false) return;
    if (params.consent !== undefined && params.consent !== true) return;

    if (errorHandling?.dedup !== false) {
        const throttleMs = errorHandling?.throttleMs ?? DEFAULT_THROTTLE_MS;
        const dedupKey = buildDedupKey(params);
        const now = Date.now();
        if (dedupKey === lastDedupKey && now - lastReportedAt < throttleMs) return;
        lastDedupKey = dedupKey;
        lastReportedAt = now;
    }

    const waitUntil = config?.generate?.getCloudflareContext?.({ async: false })?.ctx?.waitUntil;
    if (waitUntil) {
        waitUntil(callOnError(errorHandling, params));
        return;
    }
    await callOnError(errorHandling, params);
}
