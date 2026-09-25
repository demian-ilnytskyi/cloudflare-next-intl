# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.3] - 2026-09-25

### Security

- `cfni_exec`/`cfni_exec_batch`: closed an identity-spoofing hole where a caller could run `set_config('request.jwt.claims' | 'role', …)` through the raw-SQL path and act as another user under RLS. The function now rejects any statement calling `set_config(`, allows only `SELECT`/`INSERT`/`UPDATE`/`DELETE` as the top-level verb, and after execution compares `request.jwt.claims`, `request.jwt.claim.sub` and `role` against their starting values, aborting the call if any changed (this also catches changes made indirectly through a `SECURITY DEFINER` function). **Reinstall the SQL** (`npx cfni-db-install-exec --force`, then apply it) to pick up the fix.
- The install file also tries to revoke `EXECUTE` on `pg_catalog.set_config` from `public`/`anon`/`authenticated`. On managed Supabase this is a no-op (the function belongs to `supabase_admin`) and only prints a notice; the guards above don't depend on it.

### Fixed

- New `cfni_strip_literals()` helper: keyword checks now skip string literals, dollar-quoted bodies, quoted identifiers and comments, so a value like `'returning'` or `'set_config('` no longer trips the guard or sends the statement down the wrong execution path.
- `cfni-db-install-exec`/`cfni-db-codegen` failed to find the SQL it copies — it looked in this package's own `supabase/` folder, which wasn't published. `supabase/cfni_exec.sql` and its pgTAP tests now live in and ship with this package, as their only copy.

## [0.1.2] - 2026-09-16

### Fixed

- Patched drizzle-kit 0.31.10's `unescapeSingleQuotes` bug where a 2-char empty-string default (`''`) collapses to a single orphan quote before `ignoreFirstAndLastChar` can exempt it, emitting an unterminated `.default(')` in pulled schemas instead of `.default('')`.
