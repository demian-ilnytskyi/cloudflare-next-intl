import reportError, { consoleOverrideState } from './report_error';
/**
 * Replaces the global `console.error` so every `console.error(...)` call is
 * also routed through `config.errorHandling.onError`/`reportError` — the
 * original `console.error` still runs afterwards, nothing is swallowed by
 * default. Safe to call more than once (a no-op after the first call in
 * this JS realm — call it separately on the server and on the client, each
 * has its own `console`). Only takes effect when
 * `config.errorHandling.overrideConsoleError` is `true`.
 *
 * On the client ONLY (`isClient: true`), passing
 * `config.errorHandling.suppressClientConsoleError: true` skips the
 * browser's own `console.error` output entirely once a call has been
 * routed to `onError`/`reportError` — the error is still reported, it just
 * never shows up in browser devtools. Has no effect server-side.
 *
 * Sets `consoleOverrideState.active = true` in `report_error.ts` — once
 * installed, THIS override becomes the sole place that ever calls the real
 * console for a report (it already logs the raw message below, before
 * calling `reportError`), and `reportError`'s own console-logging step
 * stays out of the loop entirely. Without that, `reportError`'s own
 * fallback log would call `console.error` again — landing right back on
 * this override and recursing. (An "original console.error, captured once
 * at module load" reference does NOT reliably dodge this: Next.js's own
 * dev-mode console interception forwards through whatever `console.error`
 * is CURRENT at call time, not the function it originally wrapped, so a
 * stale capture can still loop back into a patched `console.error`.)
 *
 * A component stuck in a render-error loop calls `console.error` on every
 * render — `reportError`'s own dedup/cap (on by default, see
 * `errorHandling.dedup`/`maxReports`) is what stops that from reporting
 * unboundedly; this function does not duplicate that cap itself.
 *
 * `config.errorHandling.ignoreConsoleErrors` (default
 * `defaultIgnoredConsoleErrors` — this package's own Firebase Auth error
 * codes for expected user-input failures) and `ignoreConsoleError` both
 * skip reporting a matching call while still logging it normally — checked
 * inside `reportError` itself, so this override doesn't duplicate the check.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 * @param isClient Passed through to every report's `ErrorHandlingParams.isClient`
 *   — set `true` when installing from client-side code (e.g. the client
 *   `LocationzationClientProvider`), omit/`false` on the server. There's no
 *   `getCloudflareContext`/`ctx.waitUntil` available in the browser, so
 *   client-side reports always await `onError` directly.
 */
/**
 * Logged in place of a bare `undefined` when something calls
 * `console.error()` with no arguments (or a single `undefined`) — an
 * aborted RSC stream on a stale deploy does exactly this, leaving an
 * unactionable `undefined` line in devtools. The raw value is still passed
 * to `reportError` unchanged: `isStaleDeployError` treats exactly
 * `undefined` as a stale deploy, so substituting a string here would break
 * the recovery reload.
 */
export const EMPTY_CONSOLE_ERROR_MESSAGE = 'console.error called with no message';
/**
 * The frames BELOW this override — i.e. whoever actually called
 * `console.error`. Devtools blames this module for every forwarded call
 * (the real `console.error` runs from here), so an argument-less call left
 * nothing but a bare `undefined` line pointing at this file. Captured
 * lazily, only for that case.
 */
function callerStack() {
    const stack = new Error().stack;
    if (!stack)
        return '';
    return `\n${stack.split('\n').slice(3).join('\n')}`;
}
export default function installConsoleErrorOverride(config, isClient) {
    if (config?.errorHandling?.overrideConsoleError !== true)
        return;
    if (console.error.__isErrorHandlingOverride)
        return;
    const originalConsoleError = console.error.bind(console);
    consoleOverrideState.active = true;
    const suppressOnClient = isClient === true && config.errorHandling?.suppressClientConsoleError === true;
    const override = (message, ...optionalParams) => {
        const isEmptyCall = message === undefined && optionalParams.length === 0;
        // React's own `onCaughtError` fallback logs a caught value with a
        // plain `console.error(value)` — a component that throws `undefined`
        // therefore reaches here as an argument-less call carrying no
        // provenance at all. The stack below this override is the only
        // remaining pointer to which subtree threw, so it goes to BOTH the
        // console line and the report; without it the report says nothing
        // but "undefined".
        const stack = isEmptyCall ? callerStack() : '';
        if (!suppressOnClient) {
            if (isEmptyCall) {
                originalConsoleError(`${EMPTY_CONSOLE_ERROR_MESSAGE}${stack}`);
            }
            else {
                originalConsoleError(message, ...optionalParams);
            }
        }
        void reportError(config, {
            error: message,
            classOrMethodName: 'Global Console Error Handler',
            params: isEmptyCall ? [`${EMPTY_CONSOLE_ERROR_MESSAGE}${stack}`] : optionalParams,
            isClient,
        });
    };
    override.__isErrorHandlingOverride = true;
    console.error = override;
}
