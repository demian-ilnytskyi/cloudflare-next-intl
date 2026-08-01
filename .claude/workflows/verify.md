---
description: Prove changes work by running them. Per-layer verification checklist for clarivant.
---

# /verify — clarivant

Verification is execution, not inspection. Type-check passes ≠ feature works.

## Flutter

- [ ] `rtk flutter analyze` — clean
- [ ] `rtk flutter test` — relevant tests pass
- [ ] App runs on at least one device (`rtk flutter run -d <device>`)
- [ ] Manually exercise the changed path; confirm state transitions, navigation,
      and error UI

## Firebase Functions

- [ ] `cd functions && rtk npm run build` — compiles
- [ ] `rtk npm test` — unit tests pass
- [ ] Emulator: invoke the function with a real payload (callable: from a test
      client; trigger: by writing the trigger doc)
- [ ] Check logs: no unexpected warnings, no leaked secrets

## Supabase Edge Functions

- [ ] `rtk deno check supabase/functions/<name>/index.ts`
- [ ] `rtk supabase functions serve <name>` — invoke with curl
- [ ] CORS preflight returns expected headers
- [ ] DB writes apply with caller's RLS, not service role (unless intentional)

## Postgres migrations

- [ ] `rtk supabase db reset` — migration applies cleanly from scratch
- [ ] RLS verified for anon / authenticated / service_role
- [ ] New queries planned with `EXPLAIN (ANALYZE, BUFFERS)`

## Cross-stack

- [ ] End-to-end path tested in the Flutter app (or via curl for HTTP-only)
- [ ] No new ESLint/analyzer warnings
- [ ] No PII or secrets in logs
- [ ] Tests added for the new behavior

If you can't run something locally, **say so explicitly** instead of claiming
success.
