# Fix verify-email middleware redirect loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `update_session.ts` redirects a signed-in user to `firebaseAuth.verifyEmailPath` when the session cookie's JWT has `email_verified === false`. That claim goes stale until the ID token naturally refreshes (up to ~1hr), independent of the user's actual verification state. A consumer app's `verify-email` page does its own live check via `getAuthUser()` (fresh every request, backed by the Firebase Admin/App SDK) and redirects a *verified* user to `homePath`. When the cookie is stale but the live check is fresh, this produces an infinite redirect loop: middleware bounces stale-unverified user to `/verify-email` → page's live check says verified, bounces to `homePath` → middleware re-reads the still-stale cookie, bounces back to `/verify-email` → repeat.

**Constraint from the user:** middleware must still redirect unverified users to `verifyEmailPath` — do not remove the feature, and do not break the existing guest/auth-page/homePath redirect logic (already covered by 32 passing tests in `update_session.test.ts`).

**Fix approach (revised during implementation):** an unconditional forced refresh on every `false` claim would refresh on every single request for a genuinely, persistently unverified user — real ongoing cost, not just a one-time fix. Instead: `AuthUserProvider` (client) writes a new non-httpOnly `emailVerifiedHintCookieName` cookie (default `__fa_email_verified_hint__`) mirroring the live SDK's `emailVerified` on every auth-state change (sign-in, `onIdTokenChanged`, `reloadUser`, sign-out). `update_session.ts` only force-refreshes (via the existing `refreshIdToken` helper) when the session claims unverified AND this hint cookie disagrees (says `'true'`) — a concrete signal something changed since the claim was minted. When the hint agrees or is absent, the claim is trusted as-is with zero extra network calls.

## Global Constraints

- No behavior change to the guest (`!hasSession`) or auth-page redirect branches — all 32 existing tests in `package/src/firebase_auth/middleware/update_session.test.ts` must keep passing unmodified.
- The forced refresh must reuse `refreshIdToken` (already defined in this file) — do not add a second Firebase network call path.
- If the forced refresh fails (transient failure or invalid-refresh-token), fall back to the existing `refreshWasTransientFailure`/`clearInvalidSession` handling already in this function — do not introduce a new failure mode.
- If there's no refresh token cookie available to force a refresh with (e.g. `refreshTokenCookieName` cookie absent), fall back to trusting the existing token's claim as before (current behavior) rather than blocking the request.
- Every task ends with a local commit. Do not push.

---

### Task 1: Force a live email_verified check before redirecting to verifyEmailPath

**Files:**
- Modify: `package/src/firebase_auth/middleware/update_session.ts`
- Modify: `package/src/firebase_auth/middleware/update_session.test.ts` (add coverage for the new refresh-then-check path)
- Modify: `package/src/firebase_auth/middleware/update_session.bench.ts` (existing unverified-email bench case must still reflect the real code path after this change)
- Modify: `package/CHANGELOG.md` (new `[0.6.9]` entry — bump `package/package.json` version too)

**Interfaces:**
- No new exports. `updateSession`'s external signature/behavior is unchanged except for the specific stale-claim case described above.

- [x] **Step 1: Reproduce the bug as a failing test** — done via manual live repro (CRV app logs) confirming stale cookie claim `false` vs. live check `true`, and confirmed via unit tests added in Step 2.

- [x] **Step 2: Implement the hint-cookie-gated forced refresh**

  Implemented in `update_session.ts`: added `defaultEmailVerifiedHintCookieName` export (`'__fa_email_verified_hint__'`) and `firebaseAuth.emailVerifiedHintCookieName` config override (`types.ts`). The `verifyEmailPath` branch reads the hint cookie; it skips the forced refresh ONLY when the hint is present and explicitly `'false'` (a positive, current confirmation the claim still holds) — a `'true'` hint, or an absent/expired one, triggers `refreshIdToken` and a re-check, since neither gives a reason to trust the existing claim. Refresh success routes through the existing `refreshedToken` variable so the function's existing cookie-writing code handles it for free. Refresh `invalid` sets `clearInvalidSession` (now also gates the `!hasSession` redirect branch, since it can fire from this new path with `hasSession` already `true`). Refresh `transient-failure` or no refresh-token cookie fall back to trusting the existing claim, matching the Global Constraints.

  `AuthUserProvider` (client) now writes this hint cookie in `writeSession` (mirroring the live SDK's `emailVerified`) and `clearSession` (explicitly `'false'` on sign-out — signed-out is a confirmed non-verified state, not "unknown" — rather than clearing it, which would otherwise force an unnecessary refresh if a stale session cookie somehow still lingered). Both are called from the `onIdTokenChanged` listener, `reloadUser`, and `logout` — every point that already syncs the session/refresh-token cookies.

- [x] **Step 3: Confirm tests pass and nothing else regressed**

  All 32 original `update_session.test.ts` tests pass unmodified. Added 7 new tests covering: hint-disagrees+refresh-confirms-verified (pass-through), hint-disagrees+refresh-confirms-still-unverified (redirect), hint-absent (no refresh, trusts claim), hint-agrees (no refresh, trusts claim), hint-disagrees-no-refresh-token (trusts claim), hint-disagrees+transient-failure (trusts claim), hint-disagrees+invalid-refresh-token (clears session, redirects to login). Full package suite: 448/448 passing. `tsc --noEmit`: clean. No `.bench.ts` changes needed — the existing unverified-email bench case has no refresh-token/hint cookie, so it already exercises the "trust claim, no refresh" fast path, which is representative of the common case.

- [x] **Step 4: Update docs**

  Bumped `package/package.json` to `0.6.9`. Added `[0.6.9]` CHANGELOG entry describing the loop, its cause, and the hint-cookie fix. Updated `src/firebase_auth/README.md`'s `update_session.ts` bullet to mention the hint cookie and why it exists.
