import reportError from './report_error.js';
import stringifyUnknown from './stringify_unknown.js';
/**
 * Client-only: attaches `window.addEventListener('error'|'unhandledrejection', ...)`
 * handlers that route through `config.errorHandling.onError`/`reportError` —
 * catches uncaught exceptions and unhandled promise rejections that never go
 * through `console.error` at all (unlike `installConsoleErrorOverride`),
 * e.g. Next.js's own internal "Failed to fetch RSC payload" navigation
 * fallback. Neither handler calls `event.preventDefault()` — the browser's
 * own default handling (logging to the console) still happens, nothing is
 * swallowed. Safe to call more than once (a no-op after the first call in
 * this JS realm). Takes effect when `config.errorHandling.overrideWindowErrors`
 * is `true`, or when it's omitted and `overrideConsoleError` is `true` (so
 * enabling `overrideConsoleError` alone catches everything by default; pass
 * `overrideWindowErrors: false` explicitly to opt out of just this part).
 * No-op when `window` doesn't exist (server-side).
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function installGlobalErrorOverride(config) {
    const enabled = config?.errorHandling?.overrideWindowErrors ?? config?.errorHandling?.overrideConsoleError;
    if (enabled !== true)
        return;
    if (typeof window === 'undefined')
        return;
    if (window.__isGlobalErrorOverrideInstalled)
        return;
    window.__isGlobalErrorOverrideInstalled = true;
    window.addEventListener('error', (event) => {
        void reportError(config, {
            error: event.error ?? stringifyUnknown(event.message, true),
            classOrMethodName: 'Global Window Error Handler',
            isClient: true,
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        void reportError(config, {
            error: event.reason,
            classOrMethodName: 'Global Unhandled Rejection Handler',
            isClient: true,
        });
    });
}
