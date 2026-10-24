# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-10-24

### Changed

- **BREAKING**: Strip non-localization capabilities out of core package.
- Error reporting, console/global overrides, and stale deploy recovery moved to `cloudflare-next-intl-errors`.
- Dark mode theme script and theme cookies moved to `cloudflare-next-intl-theme`.
- Internal errors now reported via `onError` routing config hook (defaults to `console.error`).
- `HelperScript` simplified to localization only and now accepts `children` (e.g. for theme and error scripts).
- Removed `isDarkCookieKey`, `cookieConsentCookieKey`, `privacyPolicyDateCookieKey` from config exports.

## [0.1.1] - 2026-10-24

### Added

- Subpath exports `./setCookie` and `./getCookie` matching client cookie helpers.
- Optional `fallback` prop support in `serverProvider` to allow callers to isolate Suspense fallback from wrapper extensions.
- Vitest benchmark configuration `vitest.bench.config.ts`.

## [0.1.0] - 2026-10-24

### Added

- Initial release of `cloudflare-next-intl-intl` extracted from `cloudflare-next-intl`.
