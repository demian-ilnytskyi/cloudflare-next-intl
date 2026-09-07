import reportError, { type ReportErrorConfig } from './report_error.js';
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
export default function installGlobalErrorOverride(config: ReportErrorConfig | undefined): void {
    const enabled = config?.errorHandling?.overrideWindowErrors ?? config?.errorHandling?.overrideConsoleError;
    if (enabled !== true) return;
    if (typeof window === 'undefined') return;
    if ((window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled) return;
    (window as { __isGlobalErrorOverrideInstalled?: boolean }).__isGlobalErrorOverrideInstalled = true;

    window.addEventListener('error', (event: ErrorEvent) => {
        void reportError(config, {
            error: event.error ?? stringifyUnknown(event.message, true),
            classOrMethodName: 'Global Window Error Handler',
            isClient: true,
        });
    });

    // Resource-load failures (a script or stylesheet 404ing, or blocked for its
    // MIME type) fire a non-bubbling `error` event on the element itself, so
    // they only reach `window` during the capture phase, and they carry neither
    // `error` nor `message`. Without this they are reported as an empty error,
    // or not at all.
    window.addEventListener('error', (event: Event) => {
        const el = event.target as (HTMLElement & { src?: string; href?: string }) | null;
        if (!el || (el as unknown) === window) return;
        const tag = el.tagName?.toLowerCase();
        if (tag !== 'script' && tag !== 'link') return;
        const src = el.src || el.href;
        if (!src) return;
        void reportError(config, {
            error: `Failed to load ${tag} resource: ${src}`,
            classOrMethodName: 'Global Resource Error Handler',
            isClient: true,
        });
    }, true);

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        void reportError(config, {
            error: event.reason,
            classOrMethodName: 'Global Unhandled Rejection Handler',
            isClient: true,
        });
    });
}
