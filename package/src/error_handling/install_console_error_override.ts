import reportError, { type ReportErrorConfig } from './report_error';
import stringifyUnknown from './stringify_unknown';
import { defaultIgnoredConsoleErrors } from './default_ignored_console_errors';

const MAX_REPORTS_PER_INSTALL = 20;

/**
 * Replaces the global `console.error` so every `console.error(...)` call is
 * also routed through `config.errorHandling.onError`/`reportError` — the
 * original `console.error` still runs afterwards, nothing is swallowed.
 * Safe to call more than once (a no-op after the first call in this JS
 * realm — call it separately on the server and on the client, each has its
 * own `console`). Only takes effect when `config.errorHandling.overrideConsoleError`
 * is `true`.
 *
 * Caps at `MAX_REPORTS_PER_INSTALL` (20) reports per install — a component
 * stuck in a render-error loop calls `console.error` on every render, and
 * without a cap this would report (and, server-side, background via
 * `waitUntil`) unboundedly. Once the cap is hit, `console.error` still runs
 * normally, it just stops being reported.
 *
 * `config.errorHandling.ignoreConsoleErrors` (default
 * `defaultIgnoredConsoleErrors` — this package's own Firebase Auth error
 * codes for expected user-input failures) and `ignoreConsoleError` both
 * skip reporting a matching call while still logging it normally.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 * @param isClient Passed through to every report's `ErrorHandlingParams.isClient`
 *   — set `true` when installing from client-side code (e.g. the client
 *   `LocationzationClientProvider`), omit/`false` on the server. There's no
 *   `getCloudflareContext`/`ctx.waitUntil` available in the browser, so
 *   client-side reports always await `onError` directly.
 */
export default function installConsoleErrorOverride(
    config: ReportErrorConfig | undefined,
    isClient?: boolean,
): void {
    if (config?.errorHandling?.overrideConsoleError !== true) return;
    if ((console.error as { __isErrorHandlingOverride?: boolean }).__isErrorHandlingOverride) return;

    const originalConsoleError = console.error.bind(console);
    let reportCount = 0;

    const override = (message?: unknown, ...optionalParams: unknown[]) => {
        originalConsoleError(message, ...optionalParams);

        if (reportCount >= MAX_REPORTS_PER_INSTALL) return;

        const stringified = stringifyUnknown(message, isClient);
        const ignoreList = config.errorHandling?.ignoreConsoleErrors ?? defaultIgnoredConsoleErrors;
        if (ignoreList.some((ignored) => stringified.includes(ignored))) return;
        if (config.errorHandling?.ignoreConsoleError?.(stringified)) return;

        reportCount++;
        void reportError(
            config,
            { error: message, classOrMethodName: 'Global Console Error Handler', params: optionalParams, isClient },
        );
    };
    override.__isErrorHandlingOverride = true;
    console.error = override;
}
