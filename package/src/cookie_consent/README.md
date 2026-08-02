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
  Microsoft Clarity. Kept in its own module and loaded from
  `cookie_consent_analytics.tsx` via `next/dynamic` specifically so its
  `import('@microsoft/clarity')` (an optional peer dependency) never gets
  eagerly resolved by webpack/Turbopack for consumers who don't set
  `secrets.clarityProjectId` — see that file's doc comment.
- `types.ts` — `CookieConsentContextType`, per-slot `CookieDialogClassNames`/
  `CookieDialogStyles`.
- `gdpr_countries.ts` — `defaultGdprCountries` list + `resolveRequiresConsent`,
  used server-side to decide whether a visitor needs the banner at all.

## Auto-wiring

When `cookieConsent` is set, `IntlProvider` (`server/components/server_provider.tsx`)
automatically wraps `children` in `CookieConsentProvider` — no manual setup
needed for `useCookieConsent()`/the dialog components. If `cookieConsent.secrets`
or `getSecrets` is also set (and `autoWireAnalytics` isn't `false`), it
additionally resolves those secrets server-side (`getSecrets` takes
precedence when both are set — use it for values only available at request
time, e.g. from a Cloudflare `env` binding via your own
`getCloudflareContext()` call) and renders `CookieConsentAnalytics`, which
gates Cloudflare Web Analytics / Google Ads / Google Analytics / AdSense /
Microsoft Clarity behind consent. Any field left out of the resolved secrets
just skips that provider's script.

Country-based gating is opt-in and off by default: with neither
`cookieConsent.getCountryCode` nor `getCloudflareContext` set, the banner is
never shown and consent is treated as implicitly granted for everyone — the
simplest setup when you don't need real GDPR-region gating. Set one of the
two getters to turn it on: `getCountryCode` resolves the country directly
(simplest, if you already have it from a header/KV/your own logic);
`getCloudflareContext` accepts `@opennextjs/cloudflare`'s `getCloudflareContext`
function directly — not a dependency of this package, so pass your own
import — matching its exact overloaded signature
(`CookieConsentGetCloudflareContext`); called internally with
`{ async: true }`, and only `cf.country` is read from the resolved context.
Ignored when `getCountryCode` is also set. Once gating is on, countries outside
`gdprCountries` (defaults to EU/EEA + UK + Switzerland) skip the banner and
get consent seeded to `true` immediately; a country that can't be resolved
still requires consent (fail-safe).

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
fully custom element, or set `cookieConsent.privacyPolicyPath` to `false` to
disable the default link everywhere. `privacyPolicyLinkText` overrides the
default link's label (`"Privacy Policy"` / `"Learn more"`).

## Gotchas

- The privacy-policy-update banner only turns on when
  `cookieConsent.privacyPolicyDate` is configured; otherwise
  `privacyPolicyUpdated` stays `false` forever.
- `useCookieConsent` throws `"useCookieConsent must be used within a
  CookieConsentProvider"` if called outside the provider.
