# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.5] - 2026-08-02

### Fixed

- `CookieConsentAnalytics` no longer requires `@microsoft/clarity` (an
  optional peer dependency) to be installed unless `secrets.clarityProjectId`
  is actually set AND rendered. Its `import('@microsoft/clarity')` was
  previously inline, which webpack/Turbopack resolve at build time for every
  reachable module regardless of runtime branching — this broke builds for
  consumers who never configured Clarity. The import now lives in its own
  module (`clarity_script.tsx`), loaded via `next/dynamic` so it's only
  built/requested as a separate chunk once actually rendered.

## [0.4.4] - 2026-08-02

### Added

- `cookieConsent.privacyPolicyPath` (defaults to `'/privacy-policy'`; set
  `false` to disable) — `CookieConsentDialog`/`PrivacyPolicyUpdateDialog`
  now render a default, locale-prefixed privacy-policy link automatically
  when their `link` prop is omitted, instead of requiring a hardcoded link
  element every time. Pass `link={null}` to render no link for a single
  dialog, or your own element to override it. New `privacyPolicyLinkText`
  prop overrides the default link's label (`"Privacy Policy"` /
  `"Learn more"`). Exposed on `useCookieConsent()` as `privacyPolicyPath`.

## [0.4.3] - 2026-08-02

### Fixed

- `CookieConsentCloudflareContext.cf` was typed as `{ country?: string }`,
  which isn't structurally assignable from `@opennextjs/cloudflare`'s real
  `cf` type (`CfProperties`, a union of the incoming-request and
  request-init variants — `country` only exists on one branch). This made
  `getCloudflareContext: getCloudflareContext` (passed directly, per 0.4.2)
  fail to type-check. `cf` is now typed as `Record<string, unknown>`;
  `resolveRequiresConsent` reads `country` defensively at the call site.

## [0.4.2] - 2026-08-02

### Changed

- `cookieConsent.getCloudflareContext` now types as
  `CookieConsentGetCloudflareContext`, matching `@opennextjs/cloudflare`'s
  exact overloaded `getCloudflareContext` signature — pass that function
  directly (no wrapping closure needed); it's called internally with
  `{ async: true }`. Also now accepts a `null` resolved context (treated
  as an unresolved country, so consent is still required).

## [0.4.1] - 2026-08-02

### Added

- Country-based cookie-consent gating: `cookieConsent.getCountryCode` and
  `cookieConsent.getCloudflareContext` let visitors outside `gdprCountries`
  (defaults to EU/EEA + UK + Switzerland) skip the consent banner entirely,
  with consent seeded to implicitly granted. `getCountryCode` takes
  precedence over `getCloudflareContext` when both are set. Neither set
  (the default) disables country-based gating — consent is never required.
  A country that can't be resolved always requires consent (fail-safe).
- `cookieConsent.enableAnalyticsInDevMode` (defaults to `false`) — auto-wired
  analytics stay off in local development (`NODE_ENV === 'development'`)
  regardless of consent/country, unless explicitly enabled.
- `src/cookie_consent/gdpr_countries.ts` — `defaultGdprCountries` and
  `resolveRequiresConsent`, exported from `./cookieConsent`. Country lookups
  use a cached `Set` (O(1)) instead of `Array.includes()`.

### Changed

- `CookieConsentProvider` accepts `requiresConsent` (defaults to `true`),
  auto-passed by `IntlProvider` from the resolved country-gating result.

## [0.4.0] - 2026-08-02

### Added

- `cookie_consent` module: optional cookie-consent + privacy-policy-update
  banner, config-gated via `cookieConsent` on `RoutingConfig`. New subpaths:
  `./cookieConsent`, `./CookieConsentProvider`, `./useCookieConsent`,
  `./CookieConsentDialog`, `./PrivacyPolicyUpdateDialog`,
  `./cookieConsentAnalytics`.
- `IntlProvider` auto-wires `CookieConsentProvider` (and, when
  `cookieConsent.secrets`/`getSecrets` is set, `CookieConsentAnalytics`)
  whenever `cookieConsent` is configured — no manual provider nesting
  required.
- `CookieConsentAnalytics` gates Cloudflare Web Analytics, Google Ads,
  Google Analytics, AdSense, and Microsoft Clarity behind visitor consent.
- `src/cookie_consent/README.md` — module-level docs (layout, auto-wiring,
  customization, gotchas).

## [0.3.3] - 2026-08-02

### Fixed

- `AuthUserProvider`'s session-cookie sync now happens via a `'use server'`
  Server Action (`next/headers`'s `cookies().set(...)`, `httpOnly: true`)
  instead of a client-side `document.cookie` write. A client write can
  never carry `httpOnly` and is invisible to the server until the next
  natural request — this mismatch was the underlying reason the 0.3.2 fixes
  below didn't fully resolve the flash in practice.
- `LocationzationClientProvider` no longer calls `next/dynamic`'s `dynamic()`
  inside its render body. Calling `dynamic()` per-render creates a brand
  new component identity every time, forcing React to unmount/remount
  `AuthUserProvider` on every render instead of reusing the existing
  instance — each remount re-subscribed `onIdTokenChanged`, which Firebase
  immediately replayed with the current user, triggering a forced token
  refresh and another render: an infinite loop of session-cookie writes,
  one per render (visible as `POST /<page>` firing every second or two).
  `dynamic()` is now called once at module scope.
- Reverted two 0.3.2 changes that turned out to be based on an incorrect
  read of a dead, unused reference implementation rather than the actual
  proven-working code: `resolveAuthUser` is renamed back to
  `resolveAuthUserAndRedirect` and performs its authoritative redirect
  again (middleware only checks cookie *presence*, not validity — a
  forged/expired/invalid-but-present cookie needs this RSC-layer check to
  catch it), and `AuthUserProvider`'s `confirmedSignedOut` again
  initializes from `initialUser === null` rather than always `false`.

## [0.3.2] - 2026-08-02

### Fixed

- `firebase_auth` middleware no longer signs a user out on a transient
  session-refresh failure (network blip, Google 5xx, timeout). Previously
  any failure to refresh the ID token — including ones unrelated to the
  refresh token's validity — cleared the refresh-token cookie and redirected
  to the auth page; since the client SDK's own session is independent of
  these cookies, this produced a visible flash to the login page followed
  by an immediate bounce back home. Only Google's explicit "this refresh
  token is invalid" error codes (`INVALID_REFRESH_TOKEN`, `TOKEN_EXPIRED`,
  `USER_DISABLED`, `USER_NOT_FOUND`) now trigger sign-out; every other
  failure passes the request through untouched instead of guessing.

### Added

- `sessionCookieName`/`refreshTokenCookieName` on `FirebaseAuthRoutingConfig`
  — override the cookie names `firebase_auth`'s middleware, client provider,
  and server helpers read/write (default: `__fa_session__`/
  `__fa_refresh_token__`), for apps that already use different cookie names
  for their Firebase session.

## [0.3.1] - 2026-08-02

### Added

- `./getFirebaseAuthUser` subpath: unconditional, server-only `getAuthUser()`
  export, same style as `getLocale`/`getTranslations` — always types as
  `async` in editors, unlike `useFirebaseAuthUser`'s `react-server`
  condition (which TypeScript can't evaluate, so it always shows that
  subpath's client/sync signature regardless of call site).

## [0.3.0] - 2026-08-01

### Added

- `firebase_auth` module: optional Firebase Authentication integration,
  config-gated via `firebaseAuth` on `RoutingConfig`. New subpaths:
  `./firebaseAuthClient`, `./firebaseAuthClientProvider`,
  `./firebaseAuthServerProvider`, `./useFirebaseAuthUser`,
  `./firebaseAuthActions`, `./firebaseAuthMiddleware`.
- `llms.txt` at the package root — machine-readable map of every subpath,
  its purpose, and package-wide conventions/gotchas.
- `src/config/README.md` and `src/firebase_auth/README.md` — module-level
  docs for the two areas requiring setup a consumer must know before use.
- Performance benchmark suite (`vitest bench`).
- `@example` blocks on `useLocale`, `useTranslations`, `useAuthUser`, and
  the three `firebaseAuthActions` factories.

### Changed

- `intlMiddleware`'s Edge session-refresh path now caches successful
  Firebase refresh-token exchanges (Cloudflare Workers `caches.default`),
  cutting redundant round-trips to Google's Secure Token API.
- Error message for a missing `@intl-config` alias now names the alias,
  the file to create, and the README section to follow instead of a
  generic "set config file" message.
- `useLocale`/`useTranslations` throw the same wording on both the
  Server Component and Client Component implementations
  (`"... must be used within an IntlProvider"`).
- `setCookieClient`'s `value` param narrowed from `unknown` to
  `string | number | boolean`.

### Removed

- `./getLayoutStates` subpath and its dead implementation
  (`src/general/get_layout_states.ts`) — was already fully commented out
  and exported nothing at runtime.

## [0.2.2] and earlier

Not tracked in this file. See git history prior to `1f5d2ee`.
