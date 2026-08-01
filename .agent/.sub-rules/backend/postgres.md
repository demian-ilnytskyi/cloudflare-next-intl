# Postgres / Supabase — rules index

All leaf files live in [`postgres/`](postgres/). Open only the file(s) for the
change you're making.

- [postgres/schema.md](postgres/schema.md) — tables, columns, naming
  (`snake_case`), types (`int8` PKs, `varchar(128)` user IDs, enums, no
  `jsonb`), migrations, RLS-on-every-table.
- [postgres/rpc.md](postgres/rpc.md) — mandatory RPC clarivant
  (`SECURITY INVOKER`, `RETURNS TABLE`, `v_user_id := current_user_id()`,
  `formatted_error`, backend-side filter/search/sort, no breaking changes /
  `_v2`).
- [postgres/perf.md](postgres/perf.md) — `EXPLAIN`, indexes, mandatory
  `created_at` / `updated_at` (+ `trigger_set_timestamp` trigger), fetch only
  needed columns/rows, combine multi-read screens into one RPC.

Flutter calls Postgres via **RPC only** — never direct table queries. See
[`../frontend/flutter/architecture.md`](../frontend/flutter/architecture.md) for
the client-side rule.
