# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-10-26

### Fixed

- `<Link>` no longer prefetches on pointerdown. The click that follows fetches the same route with `router.push`, and the parallel prefetch raced it: two `?_rsc` requests for one URL, one of them aborted, and on vinext the click could be lost (seen most on `href="/"`). This also makes `prefetch={false}` turn off all prefetching for that Link. Pointerdown now also cancels a pending hover-dwell prefetch.
- `<Link>` reads the locale from `IntlProvider`'s context before the module cache. On the client the cache is filled by a lazy-loaded provider, so a Link could hydrate first and push the unprefixed path (`/test` instead of `/uk/test`), costing an extra redirect.
- A hash-only `href` (`#section`) no longer gets a locale prefix (it used to become `/uk#section` and leave the page) and no longer fires `cloudflare-next-intl:pending-navigation`.
- `href="/"` in a non-default locale builds `/uk` instead of `/uk/`.

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
