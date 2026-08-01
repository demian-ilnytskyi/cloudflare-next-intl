---
description: Stack-aware deployment workflow for clarivant (Flutter app, Firebase Functions, Supabase Edge Functions, Postgres migrations).
---

# /deploy — clarivant

## 0. Pre-flight (always)

- **CI/CD must be green** — tests, lint, build all pass. If any check fails,
  stop and fix. Do not deploy or test further.
- Clean tree: `rtk git status` — no unintended changes.
- Branch is what you intend to ship from.
- `rtk git log -1` shows the right commit.

## 1. Flutter app

### Android

```bash
rtk flutter build appbundle --release
# upload build/app/outputs/bundle/release/app-release.aab to Play Console
```

### iOS

```bash
rtk flutter build ipa --release
# upload via Xcode Organizer or Transporter
```

### Web (Firebase Hosting)

```bash
rtk flutter build web --release
rtk firebase deploy --only hosting
```

## 2. Firebase Cloud Functions

```bash
cd functions && rtk npm run build
rtk firebase deploy --only functions:<name>
rtk firebase functions:log --only <name> --lines 50
```

Never run bare `firebase deploy`. Always target with `--only functions:<name>`.

## 3. Supabase Edge Functions

```bash
rtk deno check supabase/functions/<name>/index.ts
rtk supabase functions deploy <name>
rtk supabase functions logs <name>
```

## 4. Postgres migrations

```bash
# Verify locally first
rtk supabase db reset                  # rebuild from migrations
# Test RLS as anon / authenticated / service-role
rtk supabase db push                   # apply to remote
rtk supabase gen types typescript --linked > supabase/types.ts
```

## 5. Post-deploy

- Smoke-test affected paths from Flutter app against prod.
- Watch logs for 5–10 min.
- Tag if this was a release cut: `rtk git tag -a vX.Y.Z -m "..."`.

## Rollback

- Firebase Functions: redeploy previous git SHA of `functions/`.
- Supabase Functions: redeploy previous version from git.
- DB migrations: write a NEW forward-only reversal migration. Never edit applied
  migration files.
