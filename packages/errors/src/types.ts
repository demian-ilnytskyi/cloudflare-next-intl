export type ConsentValue = boolean | null;

export interface ErrorHandlingParams {
    /** The caught error, in whatever shape it was thrown/rejected with. */
    error: unknown;
    /** Name of the function/method the error was caught in, e.g. `"resolveRequiresConsent"`. */
    classOrMethodName: string;
    /** Extra context to include in the report (arguments, request info, etc). */
    params?: unknown;
    /** Whether this error originated in a client-side (browser) call. */
    isClient?: boolean;
    /**
     * The visitor's current cookie-consent value (from `useCookieConsent()`
     * or your own server-side resolution), when known. When passed and not
     * `true`, `reportError`/`withErrorHandling` skip reporting entirely —
     * sending error reports to a third party (Telegram, Sentry, etc.)
     * without consent can itself be GDPR-relevant. Omit when consent isn't
     * applicable (e.g. `cookieConsent` isn't configured at all).
     */
    consent?: ConsentValue;
    /**
     * Human-readable one-string summary — `[classOrMethodName] Error:
     * <message>` plus non-empty `Params`/client-origin sections. Set by
     * `reportError` before calling `onError`/`console.error`; read this
     * instead of `error`/`params` directly when you just want something
     * printable. Ignore when passing `params` to `withErrorHandling`
     * yourself — it's always overwritten.
     */
    formattedMessage?: string;
    /**
     * Key used by `config.errorHandling.dedupGate` to dedup this report
     * against the immediately preceding one. Defaults to
     * `` `${classOrMethodName} ${stringifyUnknown(error)} ${stringifyUnknown(params ?? '')}` ``
     * when omitted (built by `reportError` itself) — set this explicitly
     * only if you want a coarser/different dedup key.
     */
    dedupKey?: string;
    /**
     * Opt-in for your own `onError` sink to attach the reporting user (see
     * `cloudflare-next-intl/resolveOptionalAuthUser`'s
     * `resolveErrorReportingUser(params.useAuthUser)`). Defaults to `false`
     * — an `onError` sink honoring this never calls `getAuthUser()` unless
     * the specific `reportError()` call site that raised this report passed
     * `true`, so a page whose only reason to resolve the user would be
     * "attach them to this error report" stays static by default instead of
     * being flagged dynamic by `checkDynamicPages`. Set `true` per call site
     * only where you actually want the user on that specific report and
     * don't mind the page becoming dynamic.
     */
    useAuthUser?: boolean;
}

export interface ErrorHandlingRoutingConfig {
    /**
     * Whether errors caught by this package's `withErrorHandling`/
     * `reportError` helpers are reported at all. Defaults to `true`. Set
     * `false` to fully disable reporting (errors are still rethrown by
     * `withErrorHandling`, just never reported).
     */
    enable?: boolean;
    /**
     * Called with the caught error whenever one is reported, in ADDITION to
     * the always-on `console.error(params.formattedMessage)` (see
     * `logToConsole` to disable that). Use this to wire your own
     * error-tracking/logging transport (Sentry, Telegram, etc) alongside the
     * console log, not instead of it. Omit to just log to the console.
     */
    onError?: (params: ErrorHandlingParams) => void | Promise<void>;
    /**
     * Whether `reportError` also logs `params.formattedMessage` via the
     * real, unpatched `console.error` (captured at module load, before
     * `installConsoleErrorOverride` can touch it — so this never loops back
     * into `reportError` even when the override is installed). Defaults to
     * `true`. Set `false` if `onError` is your only sink and you don't want
     * console output at all.
     */
    logToConsole?: boolean;
    /**
     * Whether `reportError`/`withErrorHandling` replace the global
     * `console.error` so every `console.error(...)` call in your app is
     * also routed through `onError` (the original `console.error` still
     * runs afterwards — nothing is swallowed). Defaults to `false`; call
     * `installConsoleErrorOverride()` (or pass this `true` and call
     * `IntlProvider`/`setIntlConfig`'s setup) to install it. Off by default
     * since this package is shared across apps and a global override is a
     * bigger behavior change than a plain function call.
     */
    overrideConsoleError?: boolean;
    /**
     * On the CLIENT only (`installConsoleErrorOverride(config, true)`),
     * suppresses the browser's own `console.error(...)` output for a call
     * once it's been routed to `onError`/`reportError` — the error is still
     * reported (server-side logging, Sentry, etc), it just never shows up
     * in browser devtools. Has no effect server-side (the server override
     * always keeps logging normally — there's no "hide it from the
     * terminal" use case). Only consulted when `overrideConsoleError` is
     * `true`. Defaults to `false` (nothing is swallowed anywhere, matching
     * `overrideConsoleError`'s own doc).
     */
    suppressClientConsoleError?: boolean;
    /**
     * Substrings matched against the stringified message of each
     * `console.error(...)` call (only consulted when `overrideConsoleError`
     * is `true`) — a match skips reporting it (it's still logged normally).
     * Defaults to `defaultIgnoredConsoleErrors` (this package's own Firebase
     * Auth error codes for expected user-input failures — wrong password,
     * email already in use, etc). Pass your own array to replace the
     * default entirely; pass `[]` to report everything.
     */
    ignoreConsoleErrors?: readonly string[];
    /**
     * Error message patterns matched by `isStaleDeployError(error)` to detect
     * stale deploy / chunk load errors (e.g. `'chunk'`, `'failed to fetch'`,
     * `'loading css chunk'`, `'connection closed'`, `'rsc payload'`,
     * `'minified react error #412'`). Defaults to `defaultStaleDeployPatterns`.
     */
    staleDeployPatterns?: readonly string[];
    /**
     * Custom HTML string rendered into `document.body` when a stale deploy
     * error is caught and an automatic cache-busting reload is triggered.
     * Defaults to a centered loading spinner on a clean white background.
     */
    staleDeployReloadHtml?: string;
    /**
     * Called with the stringified message of each `console.error(...)` call
     * (only consulted when `overrideConsoleError` is `true`), in addition to
     * `ignoreConsoleErrors` — return `true` to skip reporting it (it's still
     * logged normally). Use this for custom filtering logic beyond a plain
     * substring match.
     */
    ignoreConsoleError?: (message: string) => boolean;
    /**
     * Whether the client `LocationzationClientProvider` also installs
     * `window.addEventListener('error'|'unhandledrejection', ...)` handlers
     * that route through `onError`/`reportError` the same way
     * `overrideConsoleError` does for `console.error(...)` calls. Catches
     * uncaught exceptions and unhandled promise rejections that never go
     * through `console.error` at all — e.g. Next.js's own internal
     * "Failed to fetch RSC payload" navigation-fallback error. Defaults to
     * `overrideConsoleError`'s value (so setting just `overrideConsoleError:
     * true` catches everything by default) — pass `false` explicitly to
     * enable console overriding without the window listeners. No-op on the
     * server (no `window` there).
     */
    overrideWindowErrors?: boolean;
    /**
     * Dedup: `reportError` skips reporting an error whose key (`dedupKey`,
     * or a built-in key derived from `classOrMethodName`/`error`/`params`
     * when omitted) matches the immediately preceding reported error's key,
     * within `throttleMs`. On by default (matches this package's own
     * internal call sites and `installConsoleErrorOverride`'s console-loop
     * guard). Set `false` to report every distinct call with no dedup at
     * all.
     *
     * The dedup state lives inside `reportError`'s own module — this is
     * shared mutable state, safe by default only because a fresh JS realm
     * (isolate/Worker instance) starts with it cleared; in a long-lived
     * server process reused across many requests, pass `resetDedup: true`
     * on the first `reportError` call of each request/cron tick to clear it
     * (otherwise one request's errors can suppress another's).
     */
    dedup?: boolean;
    /** Throttle window in ms: the same dedup key reported again within this window is skipped. Defaults to `5000`. Only consulted when `dedup` isn't `false`. */
    throttleMs?: number;
    /** Clears the dedup last-key/timestamp state before processing this call. Pass `true` on the first `reportError` call of each request/cron tick in a long-lived server process. */
    resetDedup?: boolean;
}

export interface ErrorsCloudflareContext {
    cf?: Record<string, unknown>;
    ctx?: {
        waitUntil?: (promise: Promise<unknown>) => void;
    };
}

export interface ErrorsGetCloudflareContext {
    (options: { async: true }): Promise<ErrorsCloudflareContext | null>;
    (options?: { async: false }): ErrorsCloudflareContext | null;
}

export interface ErrorsGenerateRoutingConfig {
    ctx?: ErrorsCloudflareContext['ctx'] | (() => ErrorsCloudflareContext['ctx']);
    getCloudflareContext?: ErrorsGetCloudflareContext;
}

export type ErrorsRoutingConfig = {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: ErrorsGenerateRoutingConfig;
};
