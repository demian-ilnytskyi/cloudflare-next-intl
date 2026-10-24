# Turnstile App Check provider

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `firebaseAuth.appCheck` use Cloudflare Turnstile instead of reCAPTCHA, so no Google challenge script loads on the client.

**Architecture:** A new client `CustomProvider` gets an invisible Turnstile token and hands it to a server action. The action verifies it with Turnstile `siteverify` and mints a Firebase App Check token with the existing `mintServerAppCheckToken` (service-account custom token → `exchangeCustomToken`). The provider order stays: middleware-seeded App Check cookie first, then Turnstile, never reCAPTCHA when Turnstile is configured.

**Tech Stack:** TypeScript, Firebase JS SDK `@firebase/app-check` `CustomProvider`, Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/api.js`, `/siteverify`), Next.js server actions (vinext on Workers), vitest 3.

**Spec:** this file (sections Goal, Global Constraints); background in `docs/superpowers/specs/2026-10-24-firebase-auth-session-hardening.md`.

## Global Constraints

- Config (in `FirebaseAppCheckConfig`, `src/types/types.ts`): `turnstileSiteKey?: string` (public, client), `turnstileSecretKey?: string` (server only; never read on the client). When `turnstileSiteKey` is set it wins over `recaptchaV3SiteKey` / `recaptchaEnterpriseSiteKey`.
- Server minting credentials are required for Turnstile (`clientEmail` + `appId` + `privateKey` or the OAuth triple), same as today's `mintServerAppCheckToken`. Missing ones → the action answers `{ status: 'unavailable' }` and reports once via the existing `reportMissingCredentials`.
- Script: `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, injected on first need (same lazy pattern as `ensureRecaptchaScript`), with `onerror` short-circuit.
- Widget: `appearance: 'interaction-only'`, `execution: 'execute'`, `action: 'fire_app_check'`. Tokens are single-use: `turnstile.reset(widgetId)` after every `execute`.
- Client timeout for the whole Turnstile + exchange path: reuse `RECAPTCHA_TOKEN_TIMEOUT_MS` (8 s); rename to `APP_CHECK_CHALLENGE_TIMEOUT_MS` and keep the old export as an alias.
- `siteverify`: `POST` form body `secret`, `response`, `idempotency_key` (random UUID); accept only `success === true` and `action === 'fire_app_check'`; request-level timeout 5 s.
- Server action file is `"use server"` and exports only its async default function; types and constants live in a sibling non-server file.
- No new runtime dependencies. Commit messages: Conventional Commits, no tool attribution lines. CHANGELOG entry under the next minor version.

## Review Focus

- Turnstile script blocked (ad-block / CSP) → provider rejects fast, no 15 s wait; App Check falls back to its dummy token and auth behaves as today (Task 3 test).
- Two concurrent `getToken` calls → one widget, one in-flight execute (Task 3 test).
- Seeded App Check cookie present → Turnstile script never injected (Task 3 test).
- `turnstileSecretKey` must never reach the client bundle: the client imports nothing from the action's sibling config reader (Task 2 check with a grep in the test).
- Server action called after a deploy with a stale action ID → provider rejects; covered by existing stale-deploy recovery, no extra handling (documented only).

---

### Task 1: `verifyTurnstileToken`

**Files:**
- Create: `src/firebase_auth/server/verify_turnstile_token.ts`
- Test: `src/firebase_auth/server/verify_turnstile_token.test.ts`

**Interfaces:**
- Produces: `export type TurnstileVerdict = 'ok' | 'rejected' | 'unavailable'`.
- Produces: `export default async function verifyTurnstileToken(secret: string, token: string, expectedAction: string): Promise<TurnstileVerdict>` — `rejected` on `success: false` or action mismatch; `unavailable` on network error, non-200, timeout (5 s), or unparseable body.

- [x] **Step 1: Write the failing tests** — stub `fetch`: success+action → `ok`; `success:false` → `rejected`; action `'other'` → `rejected`; 500 → `unavailable`; fetch throws → `unavailable`; request body contains `secret`, `response` and an `idempotency_key`.
- [x] **Step 2: Run** `npx vitest run src/firebase_auth/server/verify_turnstile_token.test.ts` — FAIL (module missing).
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(firebase_auth): verify Turnstile tokens server-side`

---

### Task 2: `exchangeTurnstileTokenAction`

**Files:**
- Create: `src/firebase_auth/server/exchange_turnstile_token_action.ts` (`"use server"`)
- Create: `src/firebase_auth/turnstile_types.ts` (result type + `TURNSTILE_ACTION = 'fire_app_check'`)
- Modify: `src/types/types.ts` (`turnstileSiteKey?`, `turnstileSecretKey?` with doc comments)
- Test: `src/firebase_auth/server/exchange_turnstile_token_action.test.ts`

**Interfaces:**
- Consumes: `verifyTurnstileToken` (Task 1), `mintServerAppCheckToken(projectId, apiKey, appCheck)`, `decodeJwtPayload`.
- Produces in `turnstile_types.ts`: `export type TurnstileExchangeResult = { status: 'ok'; token: string; expireTimeMillis: number } | { status: 'rejected' } | { status: 'unavailable' }`.
- Produces: `export default async function exchangeTurnstileTokenAction(turnstileToken: string): Promise<TurnstileExchangeResult>` — non-string/empty token or missing `turnstileSecretKey` → `unavailable` (missing secret reported once); verdict `rejected` → `rejected`; mint returning `undefined` → `unavailable`; success → `expireTimeMillis = exp * 1000` of the minted token.

- [x] **Step 1: Write the failing tests** — one per result; minted token's `exp` maps to `expireTimeMillis`; `mintServerAppCheckToken` not called when verification fails; the action file's only export is the async default (read the file text and assert no other `export`).
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run src/firebase_auth/server` — PASS.
- [x] **Step 5: Commit** `feat(firebase_auth): exchange Turnstile tokens for App Check tokens`

---

### Task 3: Client Turnstile provider

**Files:**
- Modify: `src/firebase_auth/client/firebase_client.ts` (new `createTurnstileProvider`, provider selection in `initializeFirebaseAppCheck`, timeout rename)
- Test: `src/firebase_auth/client/firebase_client.test.ts`

**Interfaces:**
- Consumes: `exchangeTurnstileTokenAction` (Task 2), `isAppCheckTokenUsable`, the seeded-cookie read already in `createExplicitRecaptchaProvider` (extract it to `readSeededAppCheckToken(): { token: string; expireTimeMillis: number } | null` and reuse in both providers).
- Produces: `function createTurnstileProvider(siteKey: string, CustomProviderCtor: typeof CustomProvider)` — `getToken`: seeded cookie → return it; else ensure script, render the widget once (memoized promise, reset on failure like `ensureWidget`), `execute`, await the callback token, `reset`, call the action; `ok` → `{ token, expireTimeMillis }`; anything else → throw. Whole path raced against `APP_CHECK_CHALLENGE_TIMEOUT_MS`.
- Selection: `turnstileSiteKey` → Turnstile provider; else today's reCAPTCHA branches unchanged.

- [x] **Step 1: Write the failing tests** (stub `window.turnstile` and the action module):
  - `it('uses the seeded cookie without injecting the Turnstile script')`;
  - `it('injects the Turnstile script once and renders one widget for concurrent getToken calls')`;
  - `it('returns the exchanged App Check token with its expiry')`;
  - `it('rejects when the exchange answers rejected')`;
  - `it('rejects immediately when the Turnstile script fails to load')`;
  - `it('rejects after APP_CHECK_CHALLENGE_TIMEOUT_MS when execute never calls back')` (fake timers);
  - `it('prefers Turnstile over reCAPTCHA when both site keys are set')`.
- [x] **Step 2: Run** `npx vitest run src/firebase_auth/client/firebase_client.test.ts` — new tests FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run src/firebase_auth` — PASS.
- [x] **Step 5: Commit** `feat(firebase_auth): Turnstile App Check provider`

---

### Task 4: Preconnect + docs

**Files:**
- Modify: `src/server/components/helper_script.tsx` (`<link rel="preconnect" href="https://challenges.cloudflare.com">` when `turnstileSiteKey` is set; no Google reCAPTCHA hints in that case)
- Modify: `src/firebase_auth/README.md` (setup section, mirror of "Setup on your side" below)
- Test: `src/server/components/helper_script.test.tsx`

- [x] **Step 1: Write the failing tests** — preconnect present with `turnstileSiteKey`, absent without.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement** + README.
- [x] **Step 4: Run** `npx vitest run && npx tsc --noEmit -p . && npx eslint src` — PASS (pre-existing Node 26 `localStorage` failures in `use_stale_deploy_recovery` / `helper_script` early-catch tests: list them by name if still present).
- [x] **Step 5: Commit** `docs(firebase_auth): Turnstile App Check setup`, then `chore(release): <minor>` with CHANGELOG.

---

### Task 5: CRV verification

- [ ] **Step 1:** Build the package, copy `dist` into CRV `node_modules/cloudflare-next-intl`, set the CRV config below, `npm run dev` with `debugToken` left on for sign-in, then switch it off as in the earlier seeded-cookie test.
- [ ] **Step 2:** Expected in DevTools on `/login` (fresh context): no request to `www.google.com/recaptcha` or `gstatic.com`; one `challenges.cloudflare.com` script; one `exchangeTurnstileTokenAction` POST; `accounts:signInWithPassword` 200.
- [ ] **Step 3:** Signed-in reload after aging IndexedDB: no Turnstile script at all (seeded cookie used), user visible as before.

---

## Setup on your side (for the user)

1. **Cloudflare dashboard → Turnstile → Add widget**
   - Hostnames: every domain the app runs on (`clarivant.management`, `homeowner.clarivant.management`, `dev.*`, staging), plus `localhost` for local dev.
   - Widget mode: **Invisible**.
   - Copy the **Site Key** and **Secret Key**.
2. **Secrets / env (per environment)**
   - Public site key, e.g. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` → add to the pipeline env (same way as `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY`).
   - Secret key: `npx wrangler secret put TURNSTILE_SECRET_KEY --env contractor-production` (repeat for each `--env`), and in `.env` for local dev.
   - Service-account values already used for minting (`FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_APP_ID`) must be present in every environment — Turnstile depends on them.
3. **CRV `src/l18n/intl_config.ts`** — in `firebaseAuth.appCheck` add `turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY`; keep `recaptchaV3SiteKey` until Turnstile is confirmed in production, then remove it.
4. **Firebase console** — nothing new: the existing App Check web app registration accepts custom-token exchange. Keep App Check **enforcement** on as it is now. Optionally raise the App Check token TTL (App Check → Apps → token TTL) to reduce how often a challenge runs.
5. **Rollout check** — on staging, open `/login` in a fresh browser: Network tab shows `challenges.cloudflare.com` and no `recaptcha`; sign-in works; Firebase console → App Check → metrics shows verified requests, not unverified.
