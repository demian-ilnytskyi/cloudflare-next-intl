# Memory Index

Cross-session persistent context for this project.

---

## Supabase / Postgres conventions

### raise_rpc_error — always cast first arg to `::text`
The canonical overload is `(text, text DEFAULT, text DEFAULT, text[] DEFAULT)`.
The legacy 3-arg overload has been dropped. Every call site must cast the first
string literal: `public.raise_rpc_error('msg'::text)`. Without the cast Postgres
raises "function is not unique" at plan time.

### pgTAP must be in `extensions` schema
`CREATE EXTENSION IF NOT EXISTS pgtap SCHEMA extensions;` — installing in `public`
causes `supabase db lint` to flag `public.plan`, `public.__tcache__` etc.
Test runner passes `PGOPTIONS="-c search_path=public,extensions"` so tests still
resolve pgTAP without a schema prefix.

### SQL lint pipeline
`scripts/lint_sql.sh` runs:
1. `supabase db lint --schema public --level warning --fail-on warning`
2. Custom security-advisor REVOKE query

Tables that must not be readable by `anon`/`authenticated` need explicit:
`REVOKE SELECT ON TABLE public.<table> FROM anon, authenticated;`

### CI coverage threshold: 80%
Statement coverage measured by `plpgsql_profiler`. Every RPC exception branch
needs a `throws_ok` test using the `ALTER TABLE … RENAME` trick to force the
error path inside the transaction.

### Variable shadowing lint error
If DECLARE and EXCEPTION blocks both declare a variable with the same name,
the linter raises "variable shadows a previously defined variable". Rename the
outer variable (e.g. `v_err` → `v_error_text`).
