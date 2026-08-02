import type { NextResponse } from 'next/server';
import type { Languages } from 'next/dist/lib/metadata/types/alternative-urls-types';
import type { Videos } from 'next/dist/lib/metadata/types/metadata-types';
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
export type MiddlewareCustomHandler = (locale: string, rewriteUrl: URL | undefined, redirectUrl: URL | undefined) => NextResponse<unknown> | null | Promise<NextResponse<unknown> | null>;
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
     * Configures the optional `cookie_consent` submodule (cookie-consent +
     * privacy-policy-update banners). Omit entirely to keep it disabled —
     * `useCookieConsent()`/`CookieConsentProvider` will throw a descriptive
     * error if called without this set.
     */
    cookieConsent?: CookieConsentRoutingConfig;
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
     * Microsoft Clarity — whichever secrets resolve below) once consent is
     * granted, and gate them behind the cookie-consent banner otherwise.
     * Defaults to `true` when `secrets`/`getSecrets` is set; set `false` to
     * keep `cookieConsent` configured for the dialogs/hook only and wire
     * analytics yourself.
     */
    autoWireAnalytics?: boolean;
    /**
     * Static secrets/IDs for the analytics providers below. Use this OR
     * `getSecrets`, not both — `getSecrets` takes precedence when both are
     * set (e.g. secrets only available at request time from a Cloudflare
     * `env` binding).
     */
    secrets?: CookieConsentAnalyticsSecrets;
    /**
     * Resolves the same secrets at request time — e.g. from Cloudflare's
     * `getCloudflareContext().env` (via `@opennextjs/cloudflare`, not a
     * dependency of this package — pass your own getter). Any field left
     * `undefined` in the returned object disables that provider's script.
     */
    getSecrets?: () => CookieConsentAnalyticsSecrets | Promise<CookieConsentAnalyticsSecrets>;
    /**
     * Resolves the visitor's country code directly (ISO 3166-1 alpha-2,
     * e.g. `"DE"`) — the simplest option when you already have it from
     * somewhere (a header, a KV lookup, your own logic). Takes precedence
     * over `getCloudflareContext` when both are set.
     */
    getCountryCode?: () => string | undefined | Promise<string | undefined>;
    /**
     * Pass `getCloudflareContext` from `@opennextjs/cloudflare` directly
     * (not a dependency of this package, so bring your own import) — its
     * exact overloaded signature is accepted as-is; called internally with
     * `{ async: true }`, so you never need to wrap it yourself. Only
     * `cf.country` is read from the resolved context. Ignored when
     * `getCountryCode` is also set.
     *
     * Country-based gating (via either `getCountryCode` or
     * `getCloudflareContext`) decides whether the cookie-consent banner is
     * required at all: visitors outside `gdprCountries` skip the banner and
     * get analytics immediately (still gated by `enableAnalyticsInDevMode`).
     * Omit BOTH to require consent for everyone (fail-safe default — the
     * visitor's country can't be determined at all without either getter).
     * Set one of the two getters to scope the banner to GDPR regions only.
     */
    getCloudflareContext?: CookieConsentGetCloudflareContext;
    /**
     * Country codes (ISO 3166-1 alpha-2) for which the cookie-consent banner
     * is required. Only consulted when `getCountryCode` or
     * `getCloudflareContext` is set. Defaults to the EU/EEA + UK +
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
}
/**
 * Minimal shape read from your `getCloudflareContext()` return value — only
 * `cf.country` is consulted (read defensively at the call site, since `cf`'s
 * real type — `@opennextjs/cloudflare`'s `CfProperties`, a union of the
 * incoming-request and request-init variants — only has `country` on one
 * branch). `cf` is typed loosely here so the real (generic) function is
 * assignable to `CookieConsentGetCloudflareContext` without a hard
 * dependency on that package.
 */
export interface CookieConsentCloudflareContext {
    cf?: Record<string, unknown>;
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
    (options: {
        async: true;
    }): Promise<CookieConsentCloudflareContext | null>;
    (options?: {
        async: false;
    }): CookieConsentCloudflareContext | null;
}
export interface CookieConsentAnalyticsSecrets {
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
    /** Path to redirect signed-out users to, e.g. "/login". */
    redirectAuthPath: string;
    /** Path to redirect signed-in users away from auth pages to, e.g. "/". */
    homePath: string;
    /** Path to redirect unverified-email users to. Omit to skip email-verification redirects. */
    verifyEmailPath?: string;
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
}
export type TranslationEntry = string | TranslationObject;
export interface TranslationObject {
    [key: string]: TranslationEntry;
}
export type ReturnType = string;
export type TranslatorReturnType = (key: string) => ReturnType;
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
    videos?: Videos[] | undefined;
}
