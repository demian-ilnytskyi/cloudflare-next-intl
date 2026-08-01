# Postgres — RPC clarivant

Every RPC must follow this clarivant.

- Flutter calls Postgres via **RPC only**, never direct table queries.
- `SECURITY INVOKER` (the default) — never `SECURITY DEFINER` unless explicitly
  required and reviewed.
- `RETURNS TABLE(...)` — not raw JSON.
- `DECLARE v_user_id varchar(128) := public.current_user_id();` — never accept
  `user_id` as a parameter.
- `EXCEPTION WHEN OTHERS THEN` returning a user-friendly `formatted_error` (this
  string is shown to the end user — keep it readable).
- **Grant to both roles explicitly**:
  `GRANT EXECUTE ON FUNCTION <name> TO authenticated, anon;`. `anon` grants are
  allowed only for public/unauthenticated endpoints — document why. All others:
  `authenticated` only, and the function must verify identity via
  `current_user_id()`.
- **No breaking changes** to existing RPCs. If the signature/behavior must
  change in a way older app versions can't handle, create `<name>_v2`.
- **Backend-side filter/search/sort.** RPCs must accept filter/search/sort
  params and apply them in SQL (with appropriate indexes). Never return the full
  set for the client to filter.
- See [perf.md](perf.md) for column selection and combining multiple reads into
  one RPC.

## data-base/ folder — how RPCs and tables are managed

The project does **not** create a new migration file every time an RPC or table
changes. Instead, source-of-truth SQL lives in `supabase/data-base/`:

```
supabase/data-base/
  order.txt          # application order: types → tables → rpcs → triggers
  types/             # one .sql per enum type
  tables/            # one .sql per table (CREATE TABLE IF NOT EXISTS + RLS + REVOKE)
  rpcs/              # one .sql per function (DROP FUNCTION IF EXISTS + CREATE OR REPLACE)
  triggers/          # one .sql per trigger
```

`supabase/scripts/db_start.sh` copies these files as temporary migrations, runs
`supabase db reset`, then cleans up — so the DB is always rebuilt from this
folder, not from incremental migrations.

**When adding or changing an RPC:**

- Edit (or create) `supabase/data-base/rpcs/<function_name>.sql`.
- Start the file with `DROP FUNCTION IF EXISTS public.<name>(<arg types>);` then
  `CREATE OR REPLACE FUNCTION ...`.
- Re-run `supabase/scripts/db_start.sh --reset` to apply.
- **NEVER create a migration file for an RPC.** RPCs live only in
  `supabase/data-base/rpcs/`. Migrations are for data changes only
  (INSERT/UPDATE/DELETE seed data, or irreversible schema ops like
  `ALTER TABLE … ADD COLUMN` that can't be expressed idempotently).

**When adding or changing a table:**

- Edit (or create) `supabase/data-base/tables/<table_name>.sql`.
- Use `CREATE TABLE IF NOT EXISTS` so the file is idempotent on re-apply.
- Include RLS enable + all policies + any required `REVOKE` in the same file.

**When adding an enum type:**

- Edit (or create) `supabase/data-base/types/<type_name>.sql`.
- Types are applied before tables (see `order.txt`).

## raise_rpc_error — canonical overload

The project uses a single canonical overload:

```sql
public.raise_rpc_error(
  p_message    text,
  p_errcode    text DEFAULT 'P0001',
  p_hint       text DEFAULT NULL,
  p_detail     text[] DEFAULT NULL
)
```

**Always cast the first string literal to `text`** when calling it to avoid
Postgres overload-resolution ambiguity:

```sql
PERFORM public.raise_rpc_error('Something went wrong'::text);
```

The legacy 3-arg overload `(text, text, text) RETURNS TABLE(...)` has been
dropped. Never re-introduce it.

## pgTAP tests

- pgTAP must be installed in the `extensions` schema, **not** `public`:
  `CREATE EXTENSION IF NOT EXISTS pgtap SCHEMA extensions;`
- Test runner sets `search_path=public,extensions` so pgTAP functions remain
  resolvable without a schema prefix.
- Installing in `public` causes `supabase db lint` to flag `public.plan` etc. as
  lint errors (false positives).

## SQL lint

- `scripts/lint_sql.sh` runs two checks in order:
  1. `supabase db lint --schema public --level warning --fail-on warning`
  2. Custom security-advisor query (checks REVOKE on sensitive tables).
- All tables that should not be directly readable by `anon`/`authenticated` must
  have explicit
  `REVOKE SELECT ON TABLE public.<table> FROM anon, authenticated;`.

## Test coverage

- CI enforces ≥ 80% statement coverage via `plpgsql_profiler`.
- Every RPC's EXCEPTION branch must have at least one `throws_ok` test that
  triggers it (e.g. rename the underlying table to force the error path).
- Use `ALTER TABLE public.<t> RENAME TO <t>_temp` / restore pattern inside pgTAP
  transactions to test exception handlers without side effects.
- Variable shadowing: if the DECLARE block has a variable with the same name as
  one in an EXCEPTION handler, rename the outer one (lint will flag it).
