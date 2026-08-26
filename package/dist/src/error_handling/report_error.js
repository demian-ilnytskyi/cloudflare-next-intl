import formatErrorMessage from './format_error_message';
import stringifyUnknown from './stringify_unknown';
import { defaultIgnoredConsoleErrors } from './default_ignored_console_errors';
const DEFAULT_THROTTLE_MS = 5000;
// Set by `installConsoleErrorOverride` once it patches `console.error`.
// When active, THAT override is the sole place that ever calls the real
// console for a report — it already logs the raw message itself, before
// calling `reportError` — so `callOnError`'s own console-logging step must
// stay OUT of the loop entirely rather than trying to detect and skip a
// recursive call after the fact. Attempting the latter (capturing "the
// original console.error" at module load, or tagging messages with a
// marker) is unreliable: Next.js's own dev-mode console interception
// forwards through whatever `console.error` is CURRENT at call time, not
// the function it originally wrapped, so any capture-then-call-through
// strategy can still loop back into a patched `console.error`. Removing
// the second caller removes the race entirely — not a per-module boolean
// (that would only cover one bundle chunk's module instance of this file;
// this constant is exported so `installConsoleErrorOverride` can mutate it
// via a live binding regardless of chunk).
export const consoleOverrideState = { active: false };
// Module-scope dedup state — safe by default only because a fresh JS realm
// (isolate/Worker instance) starts with it cleared. In a long-lived server
// process reused across many requests, pass `resetDedup: true` on the first
// `reportError` call of each request/cron tick, or one request's errors can
// suppress another's.
let lastDedupKey = null;
let lastReportedAt = 0;
function buildDedupKey(params) {
    return params.dedupKey ?? `${params.classOrMethodName} ${stringifyUnknown(params.error, params.isClient)} ${params.params ? stringifyUnknown(params.params, params.isClient) : ''}`;
}
async function callOnError(config, params) {
    const paramsWithFormattedMessage = { ...params, formattedMessage: formatErrorMessage(params) };
    // When `installConsoleErrorOverride` is active, it already logged the
    // raw message to the real console BEFORE calling `reportError` — logging
    // `formattedMessage` here too would be a second, redundant console
    // write (differently formatted) for the exact same call, not a fix for
    // a missing one.
    if (config?.logToConsole !== false && !consoleOverrideState.active) {
        console.error(paramsWithFormattedMessage.formattedMessage);
    }
    if (config?.onError) {
        try {
            await config.onError(paramsWithFormattedMessage);
        }
        catch {
            if (!consoleOverrideState.active) {
                console.error(paramsWithFormattedMessage.formattedMessage);
            }
        }
    }
}
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
export default async function reportError(config, params) {
    const errorHandling = config?.errorHandling;
    if (errorHandling?.resetDedup) {
        lastDedupKey = null;
        lastReportedAt = 0;
        if (params.error === null || params.error === undefined)
            return;
    }
    if (errorHandling?.enable === false)
        return;
    if (params.consent !== undefined && params.consent !== true)
        return;
    // `ignoreConsoleErrors`/`ignoreConsoleError` used to only be consulted by
    // `installConsoleErrorOverride`'s patched `console.error` — any direct
    // `reportError`/`reportClientError` call (a caught DB/query error, an
    // error boundary's `reportClientError(error, ...)`, etc.) skipped this
    // check entirely and always reached `onError`. Checking it here instead
    // makes every path share the one ignore list.
    const stringified = stringifyUnknown(params.error, params.isClient);
    const ignoreList = errorHandling?.ignoreConsoleErrors ?? defaultIgnoredConsoleErrors;
    if (ignoreList.some((ignored) => stringified.includes(ignored)))
        return;
    if (errorHandling?.ignoreConsoleError?.(stringified))
        return;
    if (errorHandling?.dedup !== false) {
        const throttleMs = errorHandling?.throttleMs ?? DEFAULT_THROTTLE_MS;
        const dedupKey = buildDedupKey(params);
        const now = Date.now();
        if (dedupKey === lastDedupKey && now - lastReportedAt < throttleMs)
            return;
        lastDedupKey = dedupKey;
        lastReportedAt = now;
    }
    let ctx;
    if (!params.isClient) {
        const generate = config?.generate;
        if (generate?.ctx) {
            ctx = typeof generate.ctx === 'function' ? generate.ctx() : generate.ctx;
        }
        else if (generate?.getCloudflareContext) {
            try {
                ctx = generate.getCloudflareContext({ async: false })?.ctx;
            }
            catch {
                // Ignore context errors
            }
        }
    }
    if (ctx?.waitUntil) {
        ctx.waitUntil(callOnError(errorHandling, params));
        return;
    }
    await callOnError(errorHandling, params);
}
