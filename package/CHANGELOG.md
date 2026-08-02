# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
