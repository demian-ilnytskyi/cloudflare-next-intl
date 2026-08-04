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

- [ ] **Step 1: Reproduce the bug as a failing test**

  Add a test to `update_session.test.ts` that models the exact reported scenario: a valid, unexpired session cookie whose JWT claims `email_verified: false` (stale), but a fresh refresh (via the mocked `fetch` to `securetoken.googleapis.com`) returns an ID token whose claim is `email_verified: true`. Assert the response is `baseResponse` (pass-through, i.e. no redirect to `verifyEmailPath`) — matching what the live-checking page would actually observe. Confirm this test fails against the current code (which trusts the stale cookie claim and redirects, never re-checking).

- [ ] **Step 2: Implement the forced refresh**

  In `updateSession`, in the branch that currently does:
  ```ts
  } else if (fa.verifyEmailPath && !isVerifyEmailPage && token && decodeJwtPayload(token)?.email_verified === false) {
      response = buildRedirect(baseResponse, localeUrl(fa.verifyEmailPath));
  }
  ```
  Before redirecting, if a refresh-token cookie is present, call `refreshIdToken(fa.apiKey, refreshToken)` and re-decode the *refreshed* token's `email_verified` claim. Only redirect if the refreshed claim is still `false`. If the refresh succeeds, also set the refreshed session/refresh-token cookies on the response (reuse the existing `refreshedToken` cookie-writing logic later in the function — the cleanest way is to route this refresh through the same `refreshedToken` variable used by the existing expired-token refresh path, so the existing cookie-writing code at the bottom of the function picks it up for free, rather than duplicating cookie-setting logic).
  If the refresh-token cookie is absent, or the forced refresh returns `transient-failure`, fall back to the current behavior (trust the original claim) per the Global Constraints — do not block or redirect-to-login in that case.
  If the forced refresh returns `invalid`, treat it the same as the existing `clearInvalidSession` path elsewhere in this function (stale/revoked refresh token — sign out) rather than inventing new handling.

- [ ] **Step 3: Confirm the new test passes and nothing else regressed**

  Run the full `update_session.test.ts` suite (all 32+ tests) and the full package test suite. Update `update_session.bench.ts`'s "unverified email" bench case if its scenario no longer reflects a real code path (e.g. if it needs a refresh-token cookie present to exercise the new branch meaningfully) — keep it representative rather than stale.

- [ ] **Step 4: Update docs**

  Bump `package/package.json` version to `0.6.9`. Add a `[0.6.9]` entry to `package/CHANGELOG.md` under "Fixed" describing the stale-claim redirect loop and the forced-refresh fix, following the existing changelog entry style (see `[0.6.8]` immediately above it for tone/format). No README changes needed — the existing `[0.6.8]` README note already accurately describes the feature's existence; this task only fixes its correctness.
