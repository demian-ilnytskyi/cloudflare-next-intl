# `src/cookie_consent`

Optional module, active only when `cookieConsent` is set on the
`RoutingConfig` passed to `setIntlConfig` (see `../config/README.md`).
`CookieConsentProvider`/`useCookieConsent` call `requireCookieConsentConfig`
first, which throws a descriptive error instead of no-op'ing if that config
is missing.

## Layout

- `client/cookie_consent_provider.tsx` — context provider; reads/writes the
  consent + privacy-policy-date cookies via `client/functions/get_cookie` and
  `set_cookie`.
- `client/use_cookie_consent.ts` — context hook.
- `client/components/cookie_consent_dialog.tsx` — cookie-consent banner.
- `client/components/privacy_policy_update_dialog.tsx` — "privacy policy
  updated" banner; auto-enabled only when `cookieConsent.privacyPolicyDate`
  is set.
- `client/components/default_privacy_policy_link.tsx` — internal; the
  default link both dialogs render when their `link` prop is omitted,
  pointing at `cookieConsent.privacyPolicyPath`.
- `client/components/clarity_script.tsx` — internal; loads/initializes
  Microsoft Clarity. `@microsoft/clarity` is a real dependency of this
  package (always installed), but this file is still loaded from
  `cookie_consent_analytics.tsx` via `next/dynamic` so its code only ships
  as a separate chunk fetched at runtime once consent is granted and
  `analytics.clarityProjectId` is set.
- `types.ts` — `CookieConsentContextType`, per-slot `CookieDialogClassNames`/
  `CookieDialogStyles`.
- `gdpr_countries.ts` — `defaultGdprCountries` list + `resolveRequiresConsent`,
  used server-side to decide whether a visitor needs the banner at all.

## Auto-wiring

When `cookieConsent` is set, `IntlProvider` (`server/components/server_provider.tsx`)
automatically wraps `children` in `CookieConsentProvider` — no manual setup
needed for `useCookieConsent()`/the dialog components. If `cookieConsent.analytics`
or `getAnalytics` is also set (and `autoWireAnalytics` isn't `false`), it
additionally resolves that analytics config server-side (`getAnalytics` takes
precedence when both are set — use it for values only available at request
time, e.g. from a Cloudflare `env` binding via your own
`getCloudflareContext()` call) and renders `CookieConsentAnalytics`, which
gates Cloudflare Web Analytics / Google Ads / Google Analytics / AdSense /
Microsoft Clarity behind consent. Any field left out of the resolved analytics config
just skips that provider's script.

Country-based gating is on by default and needs no configuration: the
country is resolved from the request's Cloudflare geo headers
(`x-cf-country`, `cf-ipcountry` — override the list via
`cookieConsent.countryHeaderNames`, or `generate.countryHeaderNames` for
`getCountry()` generally). Countries outside `gdprCountries`
(defaults to EU/EEA + UK + Switzerland) skip the banner and get consent
seeded to `true` immediately; a country that can't be resolved still
requires consent (fail-safe).

**Static / cached pages**: for routes with `generateStaticParams` (or
routes whose HTML is cached at the Cloudflare edge as a shared response),
the server component runs once at render time with a specific visitor's
headers — but the cached HTML is then served to all subsequent visitors,
whose countries may differ. To handle this, `intlMiddleware` sets a
short-lived `__cf_country__` cookie (24 h, JS-readable, `SameSite=Lax`)
on every response — including Cloudflare edge-cache hits — from
`cf.country`. `CookieConsentProvider` reads this cookie on client mount
and re-evaluates GDPR membership, overriding the server-baked
`requiresConsent` when needed. No additional configuration is required.

Two optional getters override that resolution: `getCountryCode` resolves the
country directly (if you already have it from a header/KV/your own logic);
`generate.getCloudflareContext` (on `RoutingConfig`, shared with the
`error_handling` submodule) accepts `@opennextjs/cloudflare`'s
`getCloudflareContext` function directly — not a dependency of this
package, so pass your own import — matching its exact overloaded signature
(`CookieConsentGetCloudflareContext`); called internally with
`{ async: true }`, and only `cf.country` is read from the resolved context.
Ignored when `getCountryCode` is also set. If either getter resolves nothing,
the header-based resolution above still applies.

Analytics never load in local development (`NODE_ENV === 'development'`)
unless `cookieConsent.enableAnalyticsInDevMode` is `true` — this is checked
independently of consent/country.

## Customization

Both dialog components accept per-slot `classNames`/`styles` (root, message,
link, actions, buttons), or a `render` prop for fully bespoke markup that
bypasses the default DOM entirely — no Tailwind or other design-system
dependency is baked in.

Both also render a privacy-policy link by default when their `link` prop is
omitted — pointing at `cookieConsent.privacyPolicyPath` (defaults to
`'/privacy-policy'`), locale-prefixed the same way the package's `Link`
component does. Pass `link={null}` to render no link, `link={<...>}` for a
fully custom element, set `cookieConsent.showPrivacyPolicy: false` (or pass
`showPrivacyPolicy={false}` on the dialog component) to hide the privacy policy link,
or set `cookieConsent.privacyPolicyPath` to `false` to disable the default link everywhere.
`privacyPolicyLinkText` overrides the default link's label (`"Privacy Policy"` / `"Learn more"`).

## Gotchas

- The privacy-policy-update banner only turns on when
  `cookieConsent.privacyPolicyDate` is configured; otherwise
  `privacyPolicyUpdated` stays `false` forever.
- `useCookieConsent` throws `"useCookieConsent must be used within a
  CookieConsentProvider"` if called outside the provider.
- The `__cf_country__` cookie is set by `intlMiddleware` and is required
  for correct country-based gating on static/cached pages. It is not set
  when the country cannot be determined (no `cf.country`, no `cf-ipcountry`
  / `x-cf-country` header), in which case the server-baked value is used.
