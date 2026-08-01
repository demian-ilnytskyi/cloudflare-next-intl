---
description: Stack-aware debugging playbook. Where to look first for Flutter, Firebase Functions, Supabase Edge, and Postgres issues.
---

# /debug — clarivant

## Step 0 — pin the layer

Which layer is failing?

- **UI / state** → Flutter
- **Server-side business logic** → Firebase Functions or Supabase Edge
- **Data** → Postgres / RLS

Don't guess. Reproduce once, capture the error string, then go to the right
section.

## Flutter

- `rtk flutter analyze` — static errors first.
- Run with verbose: `rtk flutter run --verbose -d <device>`.
- DevTools (`flutter pub global run devtools`) for widget tree, network,
  performance.
- Common pitfalls:
  - `emit` after Cubit closed → guard with `if (isClosed) return;`.
  - Rebuild storms → check `buildWhen`, switch to `context.select`.
  - Missing `const` → wrap in `const` constructors.

## Firebase Functions

- Live logs: `rtk firebase functions:log --only <name>`.
- Reproduce locally via emulator:
  ```bash
  rtk firebase emulators:start --only functions,firestore,auth
  ```
- Check: function region matches the client; secrets defined; zod schema
  rejecting valid input?

## Supabase Edge Functions

- Logs: `rtk supabase functions logs <name>`.
- Reproduce locally: `rtk supabase functions serve <name>`.
- CORS errors → return CORS headers on `OPTIONS` and on the actual response.
- `JWT expired` / `permission denied for table` → you're using anon key but
  missing the user's `Authorization` header passthrough, OR RLS denies the
  action.

## Postgres / RLS

- `permission denied for table X` from app → RLS policy missing or wrong role.
- `EXPLAIN (ANALYZE, BUFFERS)` slow query → check indexes on FK + filtered
  columns.
- Lock contention: `select * from pg_locks join pg_stat_activity using (pid);`.
- Verify migration applied:
  `select * from supabase_migrations.schema_migrations;`.

## Cross-cutting

- Don't suppress errors to "make it work." Find the root cause.
- If a fix uses `--no-verify`, `--force`, or `--no-verify-jwt`, **stop** and
  explain why before proceeding.
- Capture the failing input/repro in a test before fixing.
