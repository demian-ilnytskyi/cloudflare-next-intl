# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
