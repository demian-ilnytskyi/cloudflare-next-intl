# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.4] - 2026-10-07

### Fixed

- Generated schemas no longer reference an undefined `unknown(...)` column builder. When drizzle-kit can't resolve a column's type (e.g. a view column whose type lives in another schema), it emits `unknown("col")`, which threw a `ReferenceError` at runtime. Codegen now rewrites these columns to `text(...)`.
- `order.txt` entries are now normalized: a leading `./` or `/` and trailing slashes are stripped, and an entry also counts as applied by its basename. Before, `./tables/` and `tables` didn't match, so the file was applied twice.
- A `.sql` file reached through more than one `order.txt` is applied only once.
- An `order.txt` line pointing at a file or folder that doesn't exist is now skipped. Before, a missing directory crashed the run.
- The embedded Postgres used for introspection now stubs the Supabase `net` (`http_get`/`http_post`/`http_delete`, `_http_response`), `vault` (`decrypted_secrets`) and `cron` (`schedule`/`unschedule`) objects. DDL that references `pg_net`, Vault or `pg_cron` now loads without the real extensions.

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
