import { type ReportErrorConfig } from './report_error.js';
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
export default function installGlobalErrorOverride(config: ReportErrorConfig | undefined): void;
