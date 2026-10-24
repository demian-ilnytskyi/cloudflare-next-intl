export * from 'cloudflare-next-intl-intl/types';
import type { IntlRoutingConfig, Locales, LocalePrefixMode } from 'cloudflare-next-intl-intl/types';
import type { CookieConsentDialogProps } from '../cookie_consent/client/components/cookie_consent_dialog.js';
import type { PrivacyPolicyUpdateDialogProps } from '../cookie_consent/client/components/privacy_policy_update_dialog.js';
export type { ConsentValue } from '../cookie_consent/types.js';
import type { ConfigValue, FallibleConfigValue, DbRoutingConfig, SupabaseDbConfig } from 'cloudflare-next-intl-db';
import type { FirebaseAuthRoutingConfig } from 'cloudflare-next-intl-auth/types';

/**
 * The config object you build with `setIntlConfig` and export from the file
 * referenced by the `@intl-config` alias in `next.config` (see the package
 * README's Setup section). Consumed internally by `intlMiddleware`,
 * `getLocale`, `getTranslations`, and friends.
 */
export interface RoutingConfig<
    AppLocales extends Locales = Locales,
    AppLocalePrefixMode extends LocalePrefixMode = LocalePrefixMode,
> extends IntlRoutingConfig<AppLocales, AppLocalePrefixMode> {
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
    /**
     * Whether to show the privacy policy link in the default cookie consent
     * dialog and privacy policy update dialog. Defaults to `true`.
     * Set `false` to hide the privacy policy link by default.
     */
    showPrivacyPolicy?: boolean;
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
     * Request headers read (in order) to resolve the visitor's country when
     * neither `getCountryCode` nor `generate.getCloudflareContext` produced
     * one. Defaults to `['x-cf-country', 'cf-ipcountry']` — override when
     * your edge/proxy forwards the country under a different name.
     */
    countryHeaderNames?: readonly string[];
    /**
     * Cookie name read by the client-side consent provider and by
     * `resolveRequiresConsent`'s built-in country fallback. Defaults to
     * `generate.countryCookieName` or `'__cf_country__'`.
     */
    countryCookieName?: string;
    /**
     * Country codes (ISO 3166-1 alpha-2) for which the cookie-consent banner
     * is required. Defaults to the EU/EEA + UK + Switzerland
     * (GDPR/UK-GDPR/nFADP scope). A visitor whose resolved country isn't in
     * this set is treated as NOT requiring consent; a country that couldn't
     * be resolved still requires it (fail-safe: unknown defaults to "ask").
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

export type {
    FirebaseAuthRoutingConfig,
    FirebaseAppCheckConfig,
    DeviceBindingConfig,
    DeviceBindingStore,
} from 'cloudflare-next-intl-auth/types';



/**
 * See `cloudflare-next-intl-db`'s own doc comments for field-level docs —
 * duplicated there as the canonical source since this package now delegates
 * its entire `db` module to that package (see `src/db/index.ts`).
 */
export type { ConfigValue, FallibleConfigValue, DbRoutingConfig, SupabaseDbConfig };
