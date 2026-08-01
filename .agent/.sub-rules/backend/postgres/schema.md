# Postgres — Schema, Naming, Types

Companion files: [rpc.md](rpc.md) (RPC clarivant), [perf.md](perf.md)
(performance, timestamps, fetch-only-what-you-need).

## Migrations — deployment

- **NEVER run `supabase db push` locally** unless explicitly requested.
  Migration deployment is a manual step owned by the user.

## Schema & migrations

- **RLS enabled on every table.** No exceptions.
- **`snake_case` for all identifiers** — tables, columns, functions, enums,
  parameters. Never `camelCase` (e.g. `example_field`, not `exampleField`). RPC
  parameters use the `p_` prefix (e.g. `p_user_id`, `p_search_term`).
- **Two-track schema management:**
  - `supabase/data-base/` — editable source of truth for tables, RPCs, types,
    and triggers. Edit these files directly when changing or adding an RPC or
    table. Applied via `db_start.sh --reset`. See [rpc.md](rpc.md) for details.
  - `supabase/migrations/` — **only** the setup migration and data-seed
    migrations (backfill, seed inserts, irreversible data ops). **NEVER add a
    migration for an RPC, trigger, type, table definition, or any other schema
    change** — those live exclusively in `supabase/data-base/` and are rebuilt
    via `db_start.sh --reset`. Once applied, a migration is **immutable**.
- One concern per migration. Include RLS policies in the same migration that
  adds the table.

## RLS policies

- **Every table must have explicit RLS policies for both `authenticated` and
  `anon` roles.** Never leave a role without a policy — missing = implicit deny,
  but be explicit.
- `anon` policies are almost always restrictive (`USING (false)`). Document any
  exception.
- `authenticated` policies must scope rows to the current user via
  `public.current_user_id()`.

## Types & modeling

- **Primary keys are `bigint` (`int8`) generated as identity** — not `uuid`.
  Example: `id bigint generated always as identity primary key`.
- **User identity**: `user_id` columns are **`varchar(128)`** (Firebase UID
  format). Never read `user_id` from the request body / RPC param — always
  resolve it server-side via `public.current_user_id()`.
- **No repeated fields across tables.** If the same column appears in multiple
  tables, normalize it into its own table and reference via FK.
- **Avoid `json` / `jsonb` columns.** Model the data with proper tables and
  foreign keys instead. Use JSON only when the shape is genuinely opaque /
  free-form (e.g. external payload archives) and document why.
- **Enums for fixed-value strings.** Any column whose value is one of a known
  set (status, kind, type, role) must use a Postgres `enum` (or a referenced
  lookup table) — never a free-form `text`.
