# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.2] - 2026-09-16

### Fixed

- Patched drizzle-kit 0.31.10's `unescapeSingleQuotes` bug where a 2-char empty-string default (`''`) collapses to a single orphan quote before `ignoreFirstAndLastChar` can exempt it, emitting an unterminated `.default(')` in pulled schemas instead of `.default('')`.
