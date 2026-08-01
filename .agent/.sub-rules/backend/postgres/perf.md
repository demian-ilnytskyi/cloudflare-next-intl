# Postgres — Performance, Timestamps, Fetch-Minimal

## Performance

- `EXPLAIN (ANALYZE, BUFFERS)` for new queries on non-trivial tables.
- FK → index on the child column.

## Fetch only what you need

- **Select only the columns and rows you need.** No `select *` in production
  queries — list the exact columns the RPC returns. Always pair with
  `where` / `limit` / pagination params so you never scan or return more rows
  than the caller will use.
- **Combine multiple reads into one RPC.** If the client needs 2+ pieces of
  data to render a screen / answer a request, build a single RPC that returns
  all of them (one row with multiple sub-selects, `json_agg`, or
  `RETURNS TABLE(... , related_items ...)`) instead of having the client fire
  `supabase.rpc(...)` 2–3 times. One round-trip is almost always cheaper than
  many.

## Timestamps (every table)

- **Every table has `created_at` and `updated_at` (`timestamptz not null
  default now()`).** Never set them manually from app code.
  - `created_at` is set once by the column default and never updated.
  - `updated_at` is maintained by a **`before update` trigger** that calls the
    project's `trigger_set_timestamp` function. Add the trigger in the same
    migration as the table:

    ```sql
    create trigger set_<table>_updated_at
      before update on public.<table>
      for each row execute function public.trigger_set_timestamp();
    ```

  - RPCs and clients must not write to `updated_at` directly — the trigger
    handles it.
