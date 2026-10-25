# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-10-25

### Added

- `firebaseAuth.appCheck.customTokenTtlSeconds`: lifetime of server-minted App Check tokens, sent as the custom token `ttl`. Must be an integer between 1800 and 604800; `normalizeFirebaseAuthConfig` throws otherwise.

### Changed

- `firebaseAuth.appCheck.isTokenAutoRefreshEnabled` now defaults to `false`. Tokens are fetched on demand only, so no challenge runs on page load or in a background tab. Set `true` to restore eager fetch and refresh.

### Fixed

- The idle Turnstile container is no longer `display: none`. It stays rendered, transparent and fixed to a corner, so Managed mode can pass visitors invisibly instead of falling back to the interactive checkbox.
- `AuthUserProvider` no longer defers the auth subscription on a whitelisted page when a server session marker cookie is present, so a signed-in visitor stays in the loading state instead of briefly showing as signed out.

## [0.1.0] - 2026-10-24

### Added

- Initial release of `cloudflare-next-intl-auth` extracted from `cloudflare-next-intl`.
