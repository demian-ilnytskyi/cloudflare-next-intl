# cloudflare-next-intl-db-codegen

Drizzle schema codegen CLI for [`cloudflare-next-intl-db`](../db/README.md) —
introspects your tracked SQL DDL (via a throwaway `embedded-postgres`
instance, or a live Postgres URL) with `drizzle-kit pull` and writes typed
Drizzle table definitions.

Extracted out of `cloudflare-next-intl-db` (as of that package's `0.2.0`) so
the runtime package never has to ship this CLI's dependencies —
`embedded-postgres` bundles real per-platform Postgres binaries (30MB+),
which has no reason to end up inside a Deno/Supabase Edge Function bundle
just because the function does `import { withPublicDb } from
"npm:cloudflare-next-intl-db"`.

## Install

```bash
npx --yes --package=cloudflare-next-intl-db-codegen@<version> cfni-db-codegen \
  --ddl-dir=<dir with your tracked table .sql files> \
  --out-dir=<dir for the generated schema> \
  --out-file=schema.ts \
  --skip-exec
```

Or add it as a `devDependency` and run `cfni-db-codegen`/`cfni-db-install-exec`
via an npm script — never as a runtime `dependency` of the project whose
edge functions get bundled, for the same size reason this package exists.

## Flags / env vars

| Flag | Env var | Default | |
|---|---|---|---|
| `--ddl-dir` | `CFNI_DB_DDL_DIR` | `supabase/data-base` | Directory of tracked `CREATE TABLE` DDL to introspect. |
| `--out-dir` (repeatable / comma-separated) | `CFNI_DB_OUT_DIR` | `src/shared/db/generated` | Where to write the generated schema; pass multiple to generate into several projects at once. |
| `--out-file` | `CFNI_DB_OUT_FILE` | `schema.ts` | |
| `--db-url` | `CODEGEN_DATABASE_URL` | — | Skip `embedded-postgres` and introspect this Postgres directly. |
| `--drizzle-config` | `CFNI_DB_DRIZZLE_CONFIG` | generated on the fly | |
| `--rpc-dir` | `CFNI_DB_RPC_DIR` | `<ddl-dir>/rpcs` | Where `cfni_exec.sql` gets installed. |
| `--tests-dir` | `CFNI_DB_TESTS_DIR` | sibling `tests/` of `<ddl-dir>`'s parent | |
| `--rpc-file-name` / `--tests-file-name` | `CFNI_DB_RPC_FILE_NAME` / `CFNI_DB_TESTS_FILE_NAME` | `cfni_exec.sql` | |
| `--schema-import` | `CFNI_DB_SCHEMA_IMPORT` | `cloudflare-next-intl-db/schema` | Module specifier drizzle-kit's raw `drizzle-orm`/`drizzle-orm/pg-core` imports get retargeted to. Pass `cloudflare-next-intl/dbSchema` when generating for the legacy `cloudflare-next-intl` package instead. |
| `--force` | `CFNI_DB_FORCE_EXEC` | `false` | Overwrite an existing, differing `cfni_exec.sql`/tests file. |
| `--skip-exec` | `CFNI_DB_SKIP_EXEC` | `false` | Skip installing `cfni_exec.sql` entirely. |
| `--check` | — | `false` | Exit non-zero if the DDL changed without regenerating — for CI. |

`CODEGEN_CONNECT_TIMEOUT_MS` (default `5000`) raises the reachability-check
timeout for a slow/cold-starting `--db-url` target.

## `cfni-db-install-exec`

Runs just the `cfni_exec.sql` install step standalone (no `drizzle-kit
pull`, no Postgres needed) — same flags as above, minus anything
schema-generation-specific.
