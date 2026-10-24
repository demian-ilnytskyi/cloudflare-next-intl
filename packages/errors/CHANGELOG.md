# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1] - 2026-10-24

### Fixed

- `StaleDeployScripts`: reset reload attempt counter after 30 seconds of inactivity to avoid permanently locking out recovery attempts for a given build ID.

## [0.1.0] - 2026-10-24

### Added

- Initial release of `cloudflare-next-intl-errors` extracted from `cloudflare-next-intl`.
- Production error reporting, global window/console error overrides, and `withErrorHandling` wrapper.
- Automatic stale deploy recovery, chunk load error detection, and pre-hydration recovery scripts.
