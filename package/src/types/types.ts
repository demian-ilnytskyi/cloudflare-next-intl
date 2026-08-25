import type { NextResponse } from 'next/server';
import type { Languages } from 'next/dist/lib/metadata/types/alternative-urls-types';
import type { Videos } from 'next/dist/lib/metadata/types/metadata-types';
import type { CookieConsentDialogProps } from '../cookie_consent/client/components/cookie_consent_dialog';
import type { PrivacyPolicyUpdateDialogProps } from '../cookie_consent/client/components/privacy_policy_update_dialog';
import type { ConsentValue } from '../cookie_consent/types';
import type { User } from 'firebase/auth';

/**
 * Custom middleware hook, run by `intlMiddleware` for your own logic
 * (e.g. auth, feature flags, A/B tests) — on top of the library's own
 * locale routing (locale-prefix rewrite/redirect).
 *
 * STRICT RULE — at most ONE of `rewriteUrl` / `redirectUrl` is ever set, and
 * whichever is set tells you exactly what to do:
 * - `rewriteUrl` set: apply `NextResponse.rewrite(rewriteUrl, { request })`
 *   (locale matches the default locale — URL bar stays unchanged).
 * - `redirectUrl` set: apply `NextResponse.redirect(redirectUrl, request)`
 *   (locale differs from the URL — visible redirect). The handler only runs
 *   for this case when `runHandlerOnRedirect: true` is passed.
 * - BOTH undefined: no locale routing needed (URL already has the right
 *   locale prefix). This is where your own logic belongs — return
 *   `NextResponse.next({ request })`, or your own redirect (e.g. auth).
 *
 * Returning `null` in any case makes the library apply its own default,
 * which is the same rewrite/redirect/`next()` described above.
 *
 * @param locale      The resolved locale for this request (e.g. `"en"`).
 * @param rewriteUrl  URL to rewrite to, or `undefined`.
 * @param redirectUrl URL to redirect to, or `undefined`.
 * @returns           A `NextResponse` to use for this request, or `null` to
 *                    let the library build the default one.
 *
 * @example
 * ```ts
 * middlewareHandler: (locale, rewriteUrl, redirectUrl) => {
 *   if (rewriteUrl) return NextResponse.rewrite(rewriteUrl, { request });
 *   if (redirectUrl) return NextResponse.redirect(redirectUrl, request);
 *   // No locale routing needed — your own logic goes here.
 *   return NextResponse.next({ request });
 * }
 * ```
 */
export type MiddlewareCustomHandler = (
    locale: string,
    rewriteUrl: URL | undefined,
    redirectUrl: URL | undefined,
) => NextResponse<unknown> | null | Promise<NextResponse<unknown> | null>;

/** Your app's list of supported locale codes, e.g. `["en", "de"] as const`. */
export type Locales = readonly string[];
/**
 * NOTE: currently unused by `intlMiddleware`'s actual routing logic (it
 * always rewrites for `defaultLocale` and redirects otherwise) — reserved
 * for future use. Setting `localePrefix` on {@link RoutingConfig} has no
 * runtime effect yet.
 */
export type LocalePrefixMode = 'always' | 'as-needed' | 'never';

/**
 * The config object you build with `setIntlConfig` and export from the file
 * referenced by the `@intl-config` alias in `next.config` (see the package
 * README's Setup section). Consumed internally by `intlMiddleware`,
 * `getLocale`, `getTranslations`, and friends.
 */
export interface RoutingConfig<AppLocales extends Locales, AppLocalePrefixMode extends LocalePrefixMode> {
    /**
     * All available locales.
     */
    locales: AppLocales;
    /**
     * Used when no locale matches.
     */
    defaultLocale: string;
    /**
     * Configures whether and which prefix is shown for a given locale.
     **/
    localePrefix?: AppLocalePrefixMode;
    /**
     * Can be used to disable the locale cookie or to customize it.
     */
    localeCookie?: false | CookieAttributes;
    /**
     * By setting this to `false`, the cookie as well as the `accept-language` header will no longer be used for locale detection.
     **/
    localeDetection?: boolean;
    /**
     * Configures the optional `firebase_auth` submodule. Omit entirely (or
     * leave undefined) to keep it fully disabled — no file in this package
     * ever imports `firebase/app`/`firebase/auth` unless a firebase_auth
     * export is actually called, and every such export throws a clear error
     * if this field is missing at call time rather than silently no-op'ing.
     */
    firebaseAuth?: FirebaseAuthRoutingConfig;
    /**
     * Configures the optional `db` submodule (Postgres/Drizzle access over a
     * Cloudflare Hyperdrive or plain connection string). Omit entirely to keep
     * it fully disabled — no file in this package imports `pg`/`drizzle-orm`
     * unless a `db` export is actually called, and every such export throws a
     * clear error if this field is missing at call time.
     */
    db?: DbRoutingConfig;
    /**
     * Configures the optional `cookie_consent` submodule (cookie-consent +
     * privacy-policy-update banners). Omit entirely to keep it disabled —
     * `useCookieConsent()`/`CookieConsentProvider` will throw a descriptive
     * error if called without this set.
     */
    cookieConsent?: CookieConsentRoutingConfig;
    /**
     * Request-time resolvers shared across submodules. Omit entirely to
     * leave all of them unset.
     */
    generate?: GenerateRoutingConfig;
    /**
     * Configures the optional `error_handling` submodule (shared
     * `withErrorHandling`/`reportError` helpers used internally by this
     * package and available to your own app code). Omit entirely to keep
     * the defaults: enabled, reporting via `console.error`.
     */
    errorHandling?: ErrorHandlingRoutingConfig;
};

export interface GenerateRoutingConfig {
    /**
     * Pass `getCloudflareContext` from `@opennextjs/cloudflare` directly
     * (not a dependency of this package, so bring your own import) — its
     * exact overloaded signature is accepted as-is; called internally with
     * `{ async: true }`, so you never need to wrap it yourself. Only
     * `cf.country` is read from the resolved context by `cookieConsent`.
     *
     * Country-based gating (via either `cookieConsent.getCountryCode` or
     * this getter) decides whether the cookie-consent banner is required at
     * all: visitors outside `gdprCountries` skip the banner and get
     * analytics immediately (still gated by `enableAnalyticsInDevMode`).
     * Omit BOTH to require consent for everyone (fail-safe default — the
     * visitor's country can't be determined at all without either getter).
     * Set one of the two getters to scope the banner to GDPR regions only.
     */
    getCloudflareContext?: CookieConsentGetCloudflareContext;
}

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

export interface CookieConsentRoutingConfig {
    /**
     * Date the current privacy policy was last modified, e.g. `"2026-07-20"`
     * or a `Date`. When set, the "privacy policy updated" banner
     * automatically shows to any visitor whose stored consent predates this
     * date. Omit to disable the privacy-policy-update banner entirely (the
     * cookie-consent banner still works independently).
     */
    privacyPolicyDate?: string | Date;
    /**
     * Path to your privacy-policy page, e.g. `"/privacy-policy"`. Used by
     * `CookieConsentDialog`/`PrivacyPolicyUpdateDialog` to render a default
     * link automatically when their `link` prop is omitted. Defaults to
     * `'/privacy-policy'`. Set `false` to render no link by default (still
     * overridable per-dialog via the `link` prop).
     */
    privacyPolicyPath?: string | false;
    /** Cookie-consent cookie name. Defaults to `'__cookie_consent_key__'`. */
    consentCookieName?: string;
    /** Privacy-policy-date cookie name. Defaults to `'__privacy_policy_date_key__'`. */
    privacyPolicyDateCookieName?: string;
    /** Cookie max-age in seconds for both cookies above. Defaults to 1 year (31536000). */
    cookieMaxAge?: number;
    /**
     * Whether `IntlProvider` should automatically render the analytics/ads
     * scripts (Cloudflare Web Analytics beacon, Google Consent Mode + gtag,
     * Microsoft Clarity — whichever config resolves below) once consent is
     * granted, and gate them behind the cookie-consent banner otherwise.
     * Defaults to `true` when `analytics`/`getAnalytics` is set; set `false`
     * to keep `cookieConsent` configured for the dialogs/hook only and wire
     * analytics yourself.
     */
    autoWireAnalytics?: boolean;
    /**
     * Static IDs/tokens for the analytics providers below. Use this OR
     * `getAnalytics`, not both — `getAnalytics` takes precedence when both are
     * set (e.g. values only available at request time from a Cloudflare
     * `env` binding).
     */
    analytics?: CookieConsentAnalyticsConfig;
    /**
     * Resolves the same config at request time — e.g. from Cloudflare's
     * `getCloudflareContext().env` (via `@opennextjs/cloudflare`, not a
     * dependency of this package — pass your own getter). Any field left
     * `undefined` in the returned object disables that provider's script.
     */
    getAnalytics?: () => CookieConsentAnalyticsConfig | Promise<CookieConsentAnalyticsConfig>;
    /**
     * Configures automatic `screen_view` (on route change) and Web Vitals
     * (`web_cls`/`web_fcp`/`web_fid`/`web_lcp`/`web_ttfb`/`web_inp`)
     * `gtag('event', ...)` tracking. Auto-rendered alongside
     * `CookieConsentAnalytics` whenever Google Analytics/Ads is configured
     * and `autoWireAnalytics` isn't `false` — no manual wiring needed. Omit
     * to keep all events enabled with default screen names (raw pathname);
     * set `events` to a narrower array to disable specific ones.
     */
    autoAnalyticsEvents?: AutoAnalyticsEventsConfig;
    /**
     * Resolves the visitor's country code directly (ISO 3166-1 alpha-2,
     * e.g. `"DE"`) — the simplest option when you already have it from
     * somewhere (a header, a KV lookup, your own logic). Takes precedence
     * over `getCloudflareContext` when both are set.
     */
    getCountryCode?: () => string | undefined | Promise<string | undefined>;
    /**
     * Country codes (ISO 3166-1 alpha-2) for which the cookie-consent banner
     * is required. Only consulted when `getCountryCode` or
     * `generate.getCloudflareContext` is set. Defaults to the EU/EEA + UK +
     * Switzerland (GDPR/UK-GDPR/nFADP scope). A visitor whose resolved
     * country isn't in this set is treated as NOT requiring consent; a
     * country that couldn't be resolved still requires it (fail-safe:
     * unknown defaults to "ask").
     */
    gdprCountries?: readonly string[];
    /**
     * Whether the auto-wired analytics scripts (see `autoWireAnalytics`)
     * are allowed to load in your local/dev environment. Defaults to
     * `false` — analytics stay off during local development regardless of
     * consent, matching most analytics providers' own recommendation not to
     * pollute production data with dev traffic. Set `true` to test the
     * scripts locally.
     */
    enableAnalyticsInDevMode?: boolean;
    /**
     * Whether `IntlProvider` should automatically render
     * `CookieConsentDialog` and `PrivacyPolicyUpdateDialog` (with their
     * built-in default styling/EN+UK copy) at the end of your app tree.
     * Defaults to `true` whenever `cookieConsent` is set. Set `false` to
     * keep `cookieConsent` configured for `useCookieConsent()`/analytics
     * only and render your own dialogs (or the exported components)
     * yourself, wherever you like in the tree.
     */
    autoWireDialogs?: boolean;
    /**
     * Props forwarded as-is to the auto-wired `CookieConsentDialog`.
     * Ignored when `autoWireDialogs` is `false`.
     */
    dialogProps?: CookieConsentDialogProps;
    /**
     * Props forwarded as-is to the auto-wired `PrivacyPolicyUpdateDialog`.
     * Ignored when `autoWireDialogs` is `false`.
     */
    updateDialogProps?: PrivacyPolicyUpdateDialogProps;
}

/**
 * Minimal shape read from your `getCloudflareContext()` return value.
 * `cf.country` is consulted by `cookieConsent` (read defensively at the call
 * site, since `cf`'s real type — `@opennextjs/cloudflare`'s `CfProperties`,
 * a union of the incoming-request and request-init variants — only has
 * `country` on one branch); `ctx.waitUntil` is used by `error_handling` to
 * background error reports instead of awaiting them inline. Typed loosely
 * here so the real (generic) function is assignable to
 * `CookieConsentGetCloudflareContext` without a hard dependency on that
 * package.
 */
export interface CookieConsentCloudflareContext {
    cf?: Record<string, unknown>;
    ctx?: {
        waitUntil?: (promise: Promise<unknown>) => void;
    };
}

/**
 * Matches `@opennextjs/cloudflare`'s `getCloudflareContext` overloaded
 * signature exactly, so that function can be passed as
 * `cookieConsent.getCloudflareContext` directly — this package always
 * calls it with `{ async: true }` internally (the first overload), which is
 * why that overload's return type drives `resolveRequiresConsent`'s
 * awaited result; the sync overload is accepted structurally only so the
 * real function's type (which has both) is assignable as-is.
 */
export interface CookieConsentGetCloudflareContext {
    (options: { async: true }): Promise<CookieConsentCloudflareContext | null>;
    (options?: { async: false }): CookieConsentCloudflareContext | null;
}

/** Auto-tracked event names — `screen_view` on route change, plus one per Web Vitals metric. All enabled by default. */
export type AutoAnalyticsEventName = 'screen_view' | 'web_cls' | 'web_fcp' | 'web_fid' | 'web_lcp' | 'web_ttfb' | 'web_inp';

export interface AutoAnalyticsEventsConfig {
    /**
     * Which auto-tracked events to send via `gtag('event', ...)`. Defaults
     * to all of {@link AutoAnalyticsEventName}. Pass a narrower array to
     * disable specific events (e.g. omit `'web_cls'`) while keeping the
     * rest. Only takes effect once `gtag` is available (i.e. Google
     * Analytics/Ads is configured and consent is granted).
     */
    events?: readonly AutoAnalyticsEventName[];
    /** Maps a locale-stripped pathname to a human-readable screen name for `screen_view`'s `screen_name` param. Defaults to the raw pathname. */
    getScreenName?: (path: string) => string;
}

export interface CookieConsentAnalyticsConfig {
    /** Cloudflare Web Analytics beacon token, e.g. `'{"token": "..."}'` (the raw `data-cf-beacon` attribute value). */
    cloudflareBeaconToken?: string;
    /** Google Analytics measurement ID, e.g. `"G-XXXXXXX"`. */
    googleAnalyticsId?: string;
    /** Google Ads conversion ID, e.g. `"AW-XXXXXXXXX"`. */
    googleAdsId?: string;
    /** Google AdSense publisher ID, e.g. `"ca-pub-XXXXXXXXXXXXXXXX"`. */
    googleAdSenseId?: string;
    /**
     * Microsoft Clarity project ID. `@microsoft/clarity` is a real
     * dependency of this package (small, so always installed) — loaded and
     * initialized automatically once consent is granted.
     */
    clarityProjectId?: string;
}

export interface FirebaseAuthRoutingConfig {
    /**
     * Whether `intlMiddleware` should automatically run the firebase_auth
     * redirect/session-refresh logic (guest→`redirectAuthPath`, signed-in→
     * `homePath` on auth pages, ID-token refresh) for every request.
     * Defaults to `true` — set `false` to keep `firebaseAuth` configured
     * (e.g. for the client/server providers, actions) while driving the
     * middleware redirect logic yourself instead.
     */
    middlewareEnabled?: boolean;
    /**
     * Whether `IntlProvider` should automatically wrap your app in the
     * client `AuthUserProvider` and call `resolveAuthUser` server-side.
     * Defaults to `true`. Set `false` if you drive auth entirely from your
     * own middleware (like `middlewareEnabled: false`'s manual-override
     * case, but for the client/RSC layer) and don't want this package
     * rendering any auth-related React tree on top of it — e.g. if you
     * only use `intlMiddleware`'s built-in session-refresh/redirect logic
     * and have no use for `useAuthUser()`/`AuthUserProvider` at all.
     */
    autoWireClientProvider?: boolean;
    /** Firebase project's Web API key (`NEXT_PUBLIC_FIREBASE_API_KEY` equivalent). */
    apiKey: string;
    /** Firebase project's auth domain, e.g. "my-app.firebaseapp.com". */
    authDomain: string;
    /** Firebase project ID. */
    projectId: string;
    /** Firebase project's storage bucket. */
    storageBucket?: string;
    /** Firebase project's messaging sender ID. */
    messagingSenderId?: string;
    /** Firebase app ID. */
    appId: string;
    /** Firebase Analytics measurement ID. */
    measurementId?: string;
    /**
     * Whether Firebase Performance Monitoring is initialized on the client.
     * Enabled (`true`) by default when `firebaseAuth` is configured.
     * Set `false` to disable Performance Monitoring initialization.
     */
    performance?: boolean;
    /**
     * Enables Firebase App Check on the client. Omit to leave App Check
     * uninitialized — required if App Check enforcement is turned on for
     * Auth/Firestore/etc. in the Firebase console, or every request gets
     * rejected with 401.
     */
    appCheck?: FirebaseAppCheckConfig;
    /** Path to redirect signed-out users to, e.g. "/login". Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    redirectAuthPath: string;
    /** Path to redirect signed-in users away from auth pages to, e.g. "/". Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    homePath: string;
    /** Path to redirect unverified-email users to. Omit to skip email-verification redirects. Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    verifyEmailPath?: string;
    /**
     * Path handling an emailed password-reset link. Firebase allows only ONE
     * project-wide action URL, so every template lands on the same URL with
     * a `?mode=` query param; the middleware reads that param and forwards
     * the request (query string intact, `oobCode` included) to the path for
     * that mode. Defaults to `'/reset-password'`. Must start with "/" —
     * `setIntlConfig` auto-corrects a missing leading slash with a warning.
     */
    resetPasswordPath?: string;
    /**
     * Path handling an emailed `recoverEmail` action link (undo an email
     * change). Omit to leave that mode unhandled — the request then falls
     * through to normal routing instead of being forwarded. Must start with
     * "/" — `setIntlConfig` auto-corrects a missing leading slash with a
     * warning.
     */
    recoverEmailPath?: string;
    /**
     * Path handling an emailed passwordless `signIn` action link. Omit to
     * leave that mode unhandled — the request then falls through to normal
     * routing instead of being forwarded. Must start with "/" —
     * `setIntlConfig` auto-corrects a missing leading slash with a warning.
     */
    signInPath?: string;
    /**
     * Extra/overriding `?mode=` → path entries for the emailed-action-link
     * forward described on {@link resetPasswordPath}. Merged over the
     * defaults derived from `resetPasswordPath`/`verifyEmailPath`/
     * `recoverEmailPath`, so this is how you handle a mode this config has
     * no dedicated field for (e.g. `verifyAndChangeEmail`) or point one of
     * the known modes somewhere else. Keys are raw Firebase `mode` values.
     */
    actionModePaths?: Readonly<Record<string, string>>;
    /**
     * Set `false` to disable the emailed-action-link forward entirely (see
     * {@link resetPasswordPath}) and let `?mode=` URLs route normally.
     * Defaults to `true`.
     */
    actionLinkRedirectEnabled?: boolean;
    /**
     * When `true` (the default), if an emailed-action-link carries a `continueUrl` query parameter
     * matching the request's origin (same domain/app), the middleware will redirect to `continueUrl`'s
     * path instead of the static mode path (e.g. `resetPasswordPath`). Set `false` to disable.
     */
    followSameOriginContinueUrl?: boolean;
    /**
     * Restricts the emailed-action-link forward (see {@link resetPasswordPath})
     * to this exact static path — set this to whatever path your Firebase
     * Console "action URL" is pinned to (e.g. `'/auth/action'`) so a `?mode=`
     * on any other page is left alone instead of being treated as an action
     * link. Omit to match Firebase's bare-domain-root default: any path
     * carrying `?mode=` is eligible. Must start with "/" — `setIntlConfig`
     * auto-corrects a missing leading slash with a warning.
     */
    actionLinkPath?: string;
    /**
     * Whether a same-origin emailed-action-link forward strips Firebase's own
     * `mode`/`apiKey`/`lang`/`continueUrl` params, landing the user on a clean
     * `?oobCode=` URL. Defaults to `true`. Set `false` to keep the full query
     * when the destination page reads those params itself. Cross-origin
     * redirects always keep the full query.
     */
    stripActionLinkQuery?: boolean;
    /**
     * Whether the middleware's own redirects (`redirectAuthPath`, `homePath`,
     * `verifyEmailPath`) carry over the original request's query string —
     * e.g. `/login?ref=abc` stays `/login?ref=abc` after redirecting to
     * `homePath` for a signed-in user, instead of dropping to `/`. Defaults
     * to `true`. The emailed-action-link forward (see
     * {@link resetPasswordPath}) always preserves `oobCode` regardless of
     * this setting, since it must survive that hop; when the forward stays on
     * this origin it drops Firebase's own `mode`/`apiKey`/`lang`/`continueUrl`
     * params, which the destination page no longer needs.
     */
    preserveRedirectQuery?: boolean;
    /** Returns true if the given (locale-stripped) path is an auth page (login/signup/etc). */
    isAuthPath: (path: string) => boolean;
    /** Locale-stripped paths exempt from all auth redirects (e.g. public marketing pages). */
    whiteListPaths?: readonly string[];
    /** Session cookie max-age in seconds. Defaults to 5 days (432000). */
    sessionCookieMaxAge?: number;
    /** Refresh-token cookie max-age in seconds. Defaults to 365 days (31536000). */
    refreshTokenCookieMaxAge?: number;
    /** Session cookie name. Defaults to `'__fa_session__'`. Override this if your app already uses a different name for its Firebase ID-token cookie. */
    sessionCookieName?: string;
    /** Refresh-token cookie name. Defaults to `'__fa_refresh_token__'`. Override this if your app already uses a different name for its Firebase refresh-token cookie. */
    refreshTokenCookieName?: string;
    /** Email-verified hint cookie name. Defaults to `'__fa_email_verified_hint__'`. Client-written, non-httpOnly; lets the middleware avoid an unnecessary token refresh when its view already matches the client's. */
    emailVerifiedHintCookieName?: string;
    /**
     * App Check token cookie name. Defaults to `'__fa_app_check_token__'`.
     * Client-written, non-httpOnly; carries the client's live App Check
     * token to the server so `getAuthUser()`/`getAuthenticatedAppForUser`
     * can pass it to `initializeServerApp`. Only relevant when `appCheck`
     * is configured AND App Check enforcement is turned on for Auth in the
     * Firebase console — otherwise `initializeServerApp` rejects every
     * request with `auth/firebase-app-check-token-is-invalid`.
     */
    appCheckTokenCookieName?: string;
    /**
     * App Check token cookie max-age in seconds. Defaults to 1 hour (3600) —
     * matches the App Check token's own default lifetime, so the cookie
     * doesn't outlive the token it holds.
     */
    appCheckTokenCookieMaxAge?: number;
    /**
     * Called once, the moment `AuthUserProvider` observes a real sign-in
     * (a `null → user` transition) — never on a plain token refresh of an
     * already-signed-in user. Runs after the session/refresh-token/
     * email-verified-hint cookies have already been written for this
     * user, so cookie state is in sync when this fires. A throw/rejection
     * is caught and logged via `console.error`; it never blocks cookie
     * sync or navigation.
     */
    onSignIn?: (user: User) => void | Promise<void>;
    /**
     * Called once, on the `false → true` transition of `user.emailVerified`
     * — never on a later observation of an already-verified user. Checked
     * from both `AuthUserProvider`'s `onIdTokenChanged` listener and its
     * `reloadUser()`, since either can be the first to observe the
     * transition. A throw/rejection is caught and logged via
     * `console.error`.
     */
    onEmailVerified?: (user: User) => void | Promise<void>;
    /**
     * Called once, when sign-out is confirmed — after `AuthUserProvider`'s
     * existing debounce for transient SDK null-callbacks (two consecutive
     * `onIdTokenChanged(null)` calls), not on the first, possibly
     * transient, null. Runs after the session/refresh-token cookies have
     * already been cleared. A throw/rejection is caught and logged via
     * `console.error`.
     */
    onSignOut?: () => void | Promise<void>;
}

export interface FirebaseAppCheckConfig {
    /** reCAPTCHA v3 site key. Mutually exclusive with `recaptchaEnterpriseSiteKey`. */
    recaptchaV3SiteKey?: string;
    /** reCAPTCHA Enterprise site key. Mutually exclusive with `recaptchaV3SiteKey`. */
    recaptchaEnterpriseSiteKey?: string;
    /**
     * Enables App Check's debug token on this client. Pass `true` to have
     * the Firebase SDK generate a new random token each run (logged to the
     * console — register it in the Firebase console every time it changes).
     * Pass a fixed UUID string instead to reuse the same token across
     * restarts/builds — set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` to it
     * before init, register that one UUID once, and it never changes.
     * Use only for local development — never set this in production.
     */
    debugToken?: boolean | string;
    /** Forwarded to `initializeAppCheck`'s `isTokenAutoRefreshEnabled`. Defaults to `true`. */
    isTokenAutoRefreshEnabled?: boolean;
    /**
     * Service account client email, used ONLY server-side to mint an App
     * Check token when the client-written App Check cookie is absent (e.g.
     * a cold navigation before `AuthUserProvider` has run — see
     * `appCheckTokenCookieName`). Required alongside `appId`, plus either
     * `privateKey` or the `oauthClientId`/`oauthClientSecret`/
     * `oauthRefreshToken` triple, for server-side minting. Never sent to the
     * client — read only by `firebase_server.ts`.
     */
    clientEmail: string;
    /**
     * Service account private key (PEM), paired with `clientEmail` for
     * server-side App Check token minting. Same server-only, secret-bearing
     * field as `clientEmail` — set from an untrusted-by-the-client env var
     * (e.g. `process.env.FIREBASE_PRIVATE_KEY`), never exposed to the
     * browser. Escaped `\n` sequences (common when stored in a single-line
     * env var) are unescaped automatically before use.
     *
     * Omit this and set the `oauthClientId`/`oauthClientSecret`/
     * `oauthRefreshToken` triple instead when your GCP org enforces
     * `iam.disableServiceAccountKeyCreation`, which blocks issuing this key
     * in the first place. When both are set, `privateKey` takes priority.
     */
    privateKey?: string;
    /**
     * Application Default Credentials OAuth client ID — the `client_id`
     * field from `application_default_credentials.json` (see
     * `gcloud auth application-default login`). Paired with
     * `oauthClientSecret` and `oauthRefreshToken` as an alternative to
     * `privateKey`: instead of signing the App Check custom token locally,
     * it's signed remotely via IAM Credentials `signJwt`, authenticated as
     * this OAuth identity. That identity needs
     * `roles/iam.serviceAccountTokenCreator` on `clientEmail`. Use this when
     * a service-account key can't be created (see `privateKey`). Ignored
     * when `privateKey` is set.
     */
    oauthClientId?: string;
    /** OAuth client secret paired with `oauthClientId`. Same ADC-JSON `client_secret` field, same secret-handling rules as `privateKey`. */
    oauthClientSecret?: string;
    /** OAuth refresh token paired with `oauthClientId`. Same ADC-JSON `refresh_token` field, same secret-handling rules as `privateKey`. */
    oauthRefreshToken?: string;
    /**
     * Firebase App Check app ID (e.g. `"1:1234567890:web:abcdef123456"`),
     * required alongside `clientEmail` for server-side minting. Distinct
     * from the Firebase Auth `appId` on `FirebaseAuthRoutingConfig` itself —
     * App Check registers apps separately.
     */
    appId: string;
}

export interface CookieAttributes {
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.3|Domain Set-Cookie attribute}. By default, no
     * domain is set, and most clients will consider the cookie to apply to only
     * the current domain.
     */
    domain?: string | undefined;

    /**
     * Specifies a function that will be used to encode a cookie's value. Since
     * value of a cookie has a limited character set (and must be a simple
     * string), this function can be used to encode a value into a string suited
     * for a cookie's value.
     *
     * The default function is the global `encodeURIComponent`, which will
     * encode a JavaScript string into UTF-8 byte sequences and then URL-encode
     * any that fall outside of the cookie range.
     */
    encode?(value: string): string;

    /**
     * Specifies the `Date` object to be the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.1|`Expires` `Set-Cookie` attribute}. By default,
     * no expiration is set, and most clients will consider this a "non-persistent cookie" and will delete
     * it on a condition like exiting a web browser application.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    expires?: Date | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.6|`HttpOnly` `Set-Cookie` attribute}.
     * When truthy, the `HttpOnly` attribute is set, otherwise it is not. By
     * default, the `HttpOnly` attribute is not set.
     *
     * *Note* be careful when setting this to true, as compliant clients will
     * not allow client-side JavaScript to see the cookie in `document.cookie`.
     */
    httpOnly?: boolean | undefined;
    /**
     * Specifies the number (in seconds) to be the value for the `Max-Age`
     * `Set-Cookie` attribute. The given number will be converted to an integer
     * by rounding down. By default, no maximum age is set.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    maxAge?: number | undefined;
    /**
     * Specifies the `boolean` value for the [`Partitioned` `Set-Cookie`](rfc-cutler-httpbis-partitioned-cookies)
     * attribute. When truthy, the `Partitioned` attribute is set, otherwise it is not. By default, the
     * `Partitioned` attribute is not set.
     *
     * **note** This is an attribute that has not yet been fully standardized, and may change in the future.
     * This also means many clients may ignore this attribute until they understand it.
     *
     * More information about can be found in [the proposal](https://github.com/privacycg/CHIPS)
     */
    partitioned?: boolean | undefined;
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.4|`Path` `Set-Cookie` attribute}.
     * By default, the path is considered the "default path".
     */
    path?: string | undefined;
    /**
     * Specifies the `string` to be the value for the [`Priority` `Set-Cookie` attribute][rfc-west-cookie-priority-00-4.1].
     *
     * - `'low'` will set the `Priority` attribute to `Low`.
     * - `'medium'` will set the `Priority` attribute to `Medium`, the default priority when not set.
     * - `'high'` will set the `Priority` attribute to `High`.
     *
     * More information about the different priority levels can be found in
     * [the specification][rfc-west-cookie-priority-00-4.1].
     *
     * **note** This is an attribute that has not yet been fully standardized, and may change in the future.
     * This also means many clients may ignore this attribute until they understand it.
     */
    priority?: "low" | "medium" | "high" | undefined;
    /**
     * Specifies the boolean or string to be the value for the {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|`SameSite` `Set-Cookie` attribute}.
     *
     * - `true` will set the `SameSite` attribute to `Strict` for strict same
     * site enforcement.
     * - `false` will not set the `SameSite` attribute.
     * - `'lax'` will set the `SameSite` attribute to Lax for lax same site
     * enforcement.
     * - `'strict'` will set the `SameSite` attribute to Strict for strict same
     * site enforcement.
     *  - `'none'` will set the SameSite attribute to None for an explicit
     *  cross-site cookie.
     *
     * More information about the different enforcement levels can be found in {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|the specification}.
     *
     * *note* This is an attribute that has not yet been fully standardized, and may change in the future. This also means many clients may ignore this attribute until they understand it.
     */
    sameSite?: true | false | "lax" | "strict" | "none" | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.5|`Secure` `Set-Cookie` attribute}. When truthy, the
     * `Secure` attribute is set, otherwise it is not. By default, the `Secure` attribute is not set.
     *
     * *Note* be careful when setting this to `true`, as compliant clients will
     * not send the cookie back to the server in the future if the browser does
     * not have an HTTPS connection.
     */
    secure?: boolean | undefined;
};

export type TranslationEntry = string | TranslationObject | TranslationEntry[];
export interface TranslationObject {
    [key: string]: TranslationEntry;
}

export type ReturnType = string

export interface TranslatorReturnType {
    /** Looks up `key` and coerces it to a `string`. If the value at `key` isn't a plain string (it's an array or object), this warns and returns `key` itself — use {@link TranslatorReturnType.raw} for those cases instead. */
    (key: string): ReturnType;
    /**
     * Escape hatch for non-string message values. `t(key)` always returns a
     * `string` and can't represent arrays/objects; `t.raw(key)` returns the
     * value exactly as stored in `messages/<locale>.json` — string, array,
     * or nested object, unmodified. Use it whenever a message is a list
     * (e.g. social links, FAQ entries) rather than plain text. Mirrors
     * `next-intl`'s `t.raw`, so existing `next-intl` usage patterns apply
     * as-is.
     *
     * @example
     * // messages/en.json: { "Index": { "items": ["a", "b", "c"] } }
     * const t = await getTranslations("Index");
     * const items = t.raw("items") as string[]; // ["a", "b", "c"]
     */
    raw(key: string): TranslationEntry;
}

export type changeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | undefined;

export type Alternates = {
    languages?: Languages<string> | undefined;
} | undefined;
export interface IntlSitemap {
    link?: string;
    changeFrequency?: changeFrequency;
    priority?: number | undefined;
    images?: string[] | undefined;
    lastModified: Date | string | undefined;
    videos?: Videos[] | undefined
}

/**
 * A config value that may be given directly, or as a sync/async function
 * resolved at use time. The function form lets a value come from a secret
 * store, a Cloudflare binding, or any other source that isn't available when
 * the config object is first created.
 */
export type ConfigValue<T> = T | (() => T | Promise<T>);

/**
 * A {@link ConfigValue} whose function form may also return `null` to mean
 * "this source has nothing — fall through to the next one" (an env var
 * default, or another resolver), the same way `getUserId`/`getAccessToken`
 * already do. `undefined` means the same thing; both are treated
 * identically by every resolver that reads one of these.
 */
export type FallibleConfigValue<T> = ConfigValue<T | null | undefined>;

export interface SupabaseDbConfig {
    /**
     * Supabase project URL, e.g. `https://abc.supabase.co`. Defaults to
     * `process.env.NEXT_PUBLIC_SUPABASE_URL`. May be a function (sync or
     * async) resolved on each use — return `null`/`undefined` from it to
     * fall through to the environment variable instead of erroring.
     */
    url?: FallibleConfigValue<string>;
    /**
     * Supabase anon (publishable) key. Defaults to
     * `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. This is the only key the
     * `db` module ever needs — never put a service-role key here. May be a
     * function (sync or async) resolved on each use — return
     * `null`/`undefined` from it to fall through to the environment variable
     * instead of erroring.
     */
    anonKey?: FallibleConfigValue<string>;
    /**
     * Name of the Postgres function that runs the generated SQL. Defaults to
     * `'cfni_exec'` — the function shipped in `supabase/cfni_exec.sql`.
     */
    execFunction?: string;
    /**
     * Set to `false` when `cfni_exec` is not installed and cannot be. The
     * `db` wrappers then serve only the statements they can translate into
     * PostgREST calls (single-table select/insert/update/delete, `on
     * conflict`, `returning`) and throw for anything else — joins,
     * aggregates, CTEs, transactions — naming the construct that needs raw
     * SQL. Defaults to `true`.
     *
     * Also gates Supabase-mode `db.transaction(...)`: its `cfni_exec_batch`
     * function ships in the same `supabase/cfni_exec.sql` file and needs
     * `cfni_exec` itself to run each statement, so batching is on whenever
     * this is (there is no separate flag for it) and throws the same
     * install-or-use-`connectionString` error when this is `false`.
     */
    rawSql?: boolean;
}

export interface DbRoutingConfig {
    /**
     * Postgres connection string, or a function (sync or async) returning one,
     * resolved on each connect. The function form is how you reach a value that
     * isn't available at module scope — e.g. a Cloudflare Hyperdrive binding:
     * `connectionString: async () => (await getCloudflareContext({ async: true
     * })).env.HYPERDRIVE.connectionString`. Return `null`/`undefined` from it
     * when there is nothing to give — both surface the same "could not
     * resolve a Postgres connection string" error as leaving this unset.
     */
    connectionString?: FallibleConfigValue<string>;
    /**
     * Whether the pooled client is closed once the last in-flight
     * `withPublicDb`/`withUserDb` call of the request finishes.
     *
     * @deprecated Ignored since 0.8.23. Every `withPublicDb`/`withUserDb` call
     * now opens and closes its own client, so no connection survives a call to
     * be kept open. `true` and `false` behave identically; the only difference
     * is that `false` awaits the close instead of deferring it to
     * `ctx.waitUntil`. Hyperdrive pools the server-side connection.
     */
    disconnectAfterRequest?: boolean;
    /**
     * Postgres role assumed inside `withUserDb`'s transaction, used when
     * {@link authenticatedRoleClaim} doesn't resolve one (e.g. `firebaseAuth`
     * isn't configured, or the claim is absent). May be a string or a
     * sync/async function resolved on each call. Defaults to `'authenticated'`
     * (the Supabase RLS convention).
     */
    authenticatedRole?: string | (() => string | Promise<string>);
    /**
     * Name of the Firebase custom-claims field read for the Postgres role
     * inside `withUserDb`, taking priority over {@link authenticatedRole}
     * when present on the signed-in user's ID token. Defaults to `'role'`.
     * Only consulted when `firebaseAuth` is configured; set `false` to skip
     * reading claims entirely and always use `authenticatedRole`.
     */
    authenticatedRoleClaim?: string | false;
    /**
     * Resolves the user id injected as `request.jwt.claims->>'sub'` inside
     * `withUserDb`. Omit when `firebaseAuth` is configured — the uid then
     * comes from this package's own `getAuthUser()` automatically. Provide it
     * to use a different auth source (or when `firebaseAuth` is absent).
     */
    getUserId?: () => Promise<string | null> | string | null;
    /**
     * Milliseconds `disconnectPostgres` waits for `client.end()` before giving up.
     *
     * @deprecated Ignored since 0.8.23. Client teardown is awaited or deferred
     * to `ctx.waitUntil` without a timeout.
     */
    disconnectTimeoutMs?: number;
    /**
     * Reaches Postgres through the Supabase Data API instead of a direct
     * connection, using only your project URL and anon key. Set this when you
     * have no Postgres password to give the package — `withPublicDb` and
     * `withUserDb` behave the same either way, so switching is a config change
     * with no app-code change.
     *
     * Ignored when `connectionString` is set: a direct
     * connection always wins, so adding this block cannot silently reroute
     * live traffic. Requires the `cfni_exec` function from
     * `supabase/cfni_exec.sql` to be installed in your database.
     *
     * Each statement inside a plain `withUserDb` callback is its own
     * round-trip — no shared session. Call `.transaction(...)` on the handle
     * for atomicity across statements instead: it batches them into one
     * `cfni_exec_batch` call, though (unlike connection-string mode) a later
     * statement in the callback cannot read an earlier one's result — see
     * the `db` entry point's module doc.
     */
    supabase?: SupabaseDbConfig;
    /**
     * Resolves the JWT sent as `Authorization: Bearer` for `withUserDb` in
     * Supabase mode, which is what makes PostgREST resolve the caller as
     * `authenticated` and apply RLS. Omit when `firebaseAuth` is configured —
     * the signed-in user's Firebase ID token is then used automatically.
     *
     * Unused in connection-string mode, which identifies the user with
     * `getUserId` and `set_config` instead.
     */
    getAccessToken?: () => Promise<string | null> | string | null;
}