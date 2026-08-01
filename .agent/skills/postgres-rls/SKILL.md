---
name: postgres-rls
description: Postgres schema, RLS, RPC clarivant, indexing, and migration patterns for Supabase. Forward-only migrations, SECURITY INVOKER RPCs, user-friendly error messages.
---

# Postgres + RLS (Supabase)

## Migrations

All schema changes go through migration files:

```bash
rtk supabase migration new create_employees_table
```

Once applied, a migration file is **immutable**. To change something, create a
new migration. Forward-only.

## Table defaults

```sql
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     varchar(128) not null default public.current_user_id(),
  title       text not null check (length(title) between 1 and 200),
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_user_id_idx on public.notes(user_id);

alter table public.notes enable row level security;
```

## RLS — enable + policies (always per-op)

```sql
create policy "notes_select_own" on public.notes
  for select using (public.current_user_id() = user_id);

create policy "notes_insert_own" on public.notes
  for insert with check (public.current_user_id() = user_id);

create policy "notes_update_own" on public.notes
  for update using (public.current_user_id() = user_id)
  with check (public.current_user_id() = user_id);

create policy "notes_delete_own" on public.notes
  for delete using (public.current_user_id() = user_id);
```

## RPC clarivant (mandatory shape)

- **Flutter calls Postgres via RPCs only** — never direct table queries.
- `SECURITY INVOKER` (default) so RLS applies. Never `SECURITY DEFINER` unless
  reviewed.
- `RETURNS TABLE(...)` — never raw JSON.
- Resolve `user_id` **inside** the function. Do not accept it as a parameter.
- Wrap the body in an `EXCEPTION` block returning a user-friendly
  `formatted_error`. This string is shown to end-users — keep it readable.

```sql
create or replace function public.create_note(
  p_title text,
  p_body  text
)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz
)
language plpgsql
security invoker
as $$
declare
  v_user_id varchar(128) := public.current_user_id();
  formatted_error text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  return query
  insert into public.notes (user_id, title, body)
  values (v_user_id, p_title, p_body)
  returning notes.id, notes.title, notes.body, notes.created_at;

exception when others then
  formatted_error := 'Could not create note. Please try again.';
  raise exception '%', formatted_error;
end;
$$;
```

## Versioning RPCs (no breaking changes)

If you must change an RPC in a way older app versions can't handle, **create a
new function** (`create_note_v2`) and leave the old one. Older clients keep
working.

## updated_at trigger

```sql
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
```

## Index rules

- FK → index on the child column.
- `WHERE`/`ORDER BY` columns with high cardinality → btree.
- JSONB filters → GIN on the column or expression.
- Partial indexes for hot subsets (`where archived = false`).

## Pagination in RPCs

Always paginate list RPCs server-side. Accept `p_limit`, `p_offset` (or keyset
cursor), and apply any search/filter inside the SQL — never let the client
filter locally.
