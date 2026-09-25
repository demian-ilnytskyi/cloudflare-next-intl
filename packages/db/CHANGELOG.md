# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-25

### Changed

- **Breaking:** this package no longer ships `supabase/cfni_exec.sql` or its pgTAP tests. They now live only in `cloudflare-next-intl-db-codegen` (`npx cfni-db-install-exec` copies them into your project). Error messages that point at the install file now name the new location.

### Security

- The `cfni_exec` SQL this package calls got an identity-spoofing fix (blocks `set_config` and detects session-identity changes). See `cloudflare-next-intl-db-codegen` 0.1.3 and reinstall the SQL.
