# `src/firebase_auth_check`

Statically validates the `firebaseAuth` block of your `@intl-config` file, so
a missing required field or an unset `FIREBASE_SERVICE_ACCOUNT_*` env var
shows up in the terminal on `vite dev` / `vite build` instead of as a
production-only "signed-in user renders as signed-out".

Wired in automatically by the Vite plugin (`firebaseAuthCheck`, on by
default in both dev and build — see `src/vite/firebase_auth_check_plugin.ts`).
It prints a report and lets the build continue; pass
`firebaseAuthCheck: { strict: true }` to fail the build instead, or
`firebaseAuthCheck: false` to turn it off.

## What it reports

- **Errors** — the fields nothing works without: `apiKey`, `authDomain`,
  `projectId`, `appId`, `redirectAuthPath`, `homePath`. The Firebase SDK
  rejects init without the first four; the middleware's guest/auth-page
  redirects silently never match without the last two.
- **Warnings** — when `appCheck` is present but server-side minting can't
  run: `clientEmail`/`appId`, plus **one** of the two signing credentials
  (`privateKey`, or the full
  `oauthClientId`/`oauthClientSecret`/`oauthRefreshToken` triple). A partial
  triple is reported field-by-field. Same misconfiguration
  `mintServerAppCheckToken` reports at runtime, and the same opt-out is
  honored here: `appCheck.reportMissingServerCredentials: false` silences
  every `appCheck` warning.

## How it decides

Source-text analysis, not evaluation — the config file reads `process.env`
at module scope and imports app code, so a plugin can't import it. The
`firebaseAuth` object literal is located by brace matching (skipping
strings/comments, and looking through a `cond ? {...} : undefined`
wrapper), each field's raw value text is read, and `process.env.X` reads
are resolved against `process.env` merged with Vite's `loadEnv` (empty
prefix, so server-only `.env*` secrets count).

Deliberately conservative: only an absent key, an empty string literal, an
`undefined`/`null` value, and a value whose *only* source is unset env vars
are reported. Anything it can't evaluate — a call, an imported constant, a
`??` fallback — counts as present, because guessing would mean false
alarms on working configs.

```ts
import { checkFirebaseAuthConfig } from "cloudflare-next-intl/checkFirebaseAuthConfig";

const report = checkFirebaseAuthConfig({ intlConfigPath: "src/l18n/intl_config.ts" });
// { valid, checked, issues: [{ field, severity, reason, envVar?, lineNumber? }], formattedMessage }
```

`checked: false` means there was no `firebaseAuth` block (or no readable
file) — nothing to validate, never a failure.
