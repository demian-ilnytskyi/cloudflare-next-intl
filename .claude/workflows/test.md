---
description: Stack-aware testing workflow. Flutter widget/bloc tests, Firebase Functions Vitest/Jest, Supabase Edge Deno.test, Postgres RLS checks, Python script tests.
---

# /test — clarivant

## Flutter

- Unit / widget tests in `test/`, mirror `lib/` structure.
- Use `bloc_test` for Bloc/Cubit transitions, `mocktail` for mocks (no codegen).
- Golden tests behind a tag to skip in default CI.

```bash
rtk flutter test                          # all
rtk flutter test test/path/to/file.dart   # one file
rtk flutter test --tags golden            # opt-in
```

## Firebase Functions (Node/TS)

- Vitest for pure logic. Firebase Emulator for integration.

```bash
cd functions
rtk npm test
rtk firebase emulators:exec --only functions,firestore "npm run test:integration"
```

- Validate inputs with zod **before** Firestore access; test invalid-input
  branches.

## Supabase Edge Functions (Deno/TS)

```bash
rtk deno test --allow-net --allow-env supabase/functions/<name>
```

- For functions hitting the DB, run against `supabase start` local stack.

## Postgres / RLS

After any policy change, test with all three roles:

```sql
-- as anon
set local role anon;                  select * from public.notes;  -- expect 0
-- as authenticated (impersonate user)
set local role authenticated;
set local request.jwt.claim.sub = '<user-uuid>';
select * from public.notes;           -- expect only that user's rows
-- as service_role
set local role service_role;          select * from public.notes;  -- expect all
```

## Python scripts

- `python -m unittest discover` or `pytest` in `.claude/scripts/tests/`.
- Use `--dry-run` mode in tests for destructive scripts.

## What to test (priorities)

1. Domain logic (Cubits/Blocs, validation, policy decisions).
2. RLS policies — explicit negative tests.
3. Input validation (zod schemas) — boundary + invalid cases.
4. Integration paths that cross trust boundaries (HTTP → DB, webhook → DB).
