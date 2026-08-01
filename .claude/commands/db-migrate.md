---
description: Create and apply a Supabase Postgres migration. Usage: /db-migrate <migration_name>
---

1. `rtk supabase migration new <name>` — creates `supabase/migrations/<ts>_<name>.sql`.
2. Edit the SQL. Forward-only. Use `IF NOT EXISTS` where reasonable.
3. Apply locally: `rtk supabase db reset` (full rebuild) or `rtk supabase migration up`.
4. If schema changed: regenerate types `rtk supabase gen types typescript --local > supabase/types.ts`.
5. Push to remote: `rtk supabase db push` (only when verified locally).

Always include matching RLS policy changes in the same migration when adding user-facing tables.
