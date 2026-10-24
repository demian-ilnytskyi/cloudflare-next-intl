# Auth hardening B — server-written session cookies and split recovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only the server writes `__fa_session__` / `__fa_refresh_token__`, so Safari ITP and the HttpOnly write-drop can no longer lose or freeze the session, and a client that loses its SDK user restores it from the server session instead of being logged out.

**Architecture:** The client calls a server action, `syncSessionAction`, that sets the HttpOnly `Secure` pair and the readable marker from plan A. It calls it only when the marker is absent, has less than 20 % of the refresh-cookie lifetime left, or carries another refresh token's hash. One in-flight sync per refresh token is shared, so sign-in helpers can await the same promise the provider started. A second server action, `restoreSessionAction`, turns the server's refresh cookie into a Firebase custom token when the SDK has dropped the user.

**Tech Stack:** TypeScript, Next.js server actions (vinext on Workers), `@firebase/auth` `signInWithCustomToken`, `jose` (already a dependency), vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-24-firebase-auth-session-hardening.md`

**Depends on:** plan A merged (`isSecureRequest`, `session_marker.ts`, `hasServerSessionMarker`, `shouldClearServerCookies`).

## Global Constraints

- All Global Constraints of plan A apply.
- Sync threshold: sync when `expiresAt - now < 0.2 * refreshMaxAge` (`refreshMaxAge = fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE`).
- `syncSessionAction` writes cookies with `sessionCookieOptions(fa, true)` (same as `persistRefreshedSession`; Chrome and Safari accept `Secure` on `http://localhost`) and the marker with `expiresAt = now + refreshMaxAge`.
- The client never writes `__fa_session__`, `__fa_refresh_token__` or `__fa_has_session__`; it still writes the email-verified hint and App Check cookies.
- Custom token claims are fixed by Firebase: `iss` = `sub` = service-account email, `aud` = `https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit`, `iat`, `exp = iat + 3600`, `uid`.
- Service-account credentials come from `fa.appCheck` (`clientEmail` + `privateKey`, or the OAuth triple), the same ones `mintServerAppCheckToken` uses.

## Review Focus

- Sign-in immediately followed by navigation (CRV `login_client_form` uses `window.location.replace`): the navigation must carry the new cookies, i.e. sign-in helpers resolve only after the sync (Task 3 test).
- Password change / re-login: new refresh token → hash mismatch → sync replaces the old server pair (Task 2 test).
- Hourly ID-token refreshes with an unchanged refresh token and a fresh marker make **no** server call (Task 2 test).
- Restore loop: restore succeeds but the SDK emits null again → at most one restore attempt per mount (Task 5 test).
- Restore while App Check is down: `signInWithCustomToken` rejects → server pair kept on `unavailable`, cleared only on `invalid` / `no-session` (Task 5 test).

---

### Task 1: `syncSessionAction`

**Files:**
- Create: `src/firebase_auth/server/sync_session_action.ts` (`"use server"`)
- Test: `src/firebase_auth/server/sync_session_action.test.ts`

**Interfaces:**
- Consumes: `sessionCookieOptions`, `isIdTokenExpired`, cookie-name defaults (`update_session.ts`); `encodeSessionMarker` (plan A).
- Produces: `export interface SyncSessionInput { idToken: string; refreshToken: string; devicePublicJwk?: JsonWebKey }` (`devicePublicJwk` is used by plan C).
- Produces: `export type SyncSessionResult = { status: 'synced' } | { status: 'rejected' }`.
- Produces: `export default async function syncSessionAction(input: SyncSessionInput): Promise<SyncSessionResult>` — `rejected` (and no cookie written) when either field is not a non-empty string or the ID token is expired / undecodable; otherwise sets the HttpOnly pair and the marker.

- [ ] **Step 1: Write the failing tests** — `it('sets the HttpOnly pair and the marker')` (assert `httpOnly`, `secure`, `maxAge` of each cookie and that the marker decodes to the refresh token's hash); `it('rejects an expired ID token without writing cookies')`; `it('rejects a missing refresh token')`.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/server/sync_session_action.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): add syncSessionAction`

---

### Task 2: Client sync decision and shared in-flight sync

**Files:**
- Create: `src/firebase_auth/client/session_sync.ts`
- Test: `src/firebase_auth/client/session_sync.test.ts`

**Interfaces:**
- Consumes: `decodeSessionMarker`, `refreshTokenHash` (plan A), `syncSessionAction` (Task 1), `getCookie`.
- Produces: `export async function needsSessionSync(marker: string | undefined, refreshToken: string, refreshMaxAgeSeconds: number, nowSeconds: number): Promise<boolean>` — true when the marker is absent/undecodable, below the 20 % threshold, or its hash ≠ `refreshTokenHash(refreshToken)`.
- Produces: `export function ensureSessionSynced(user: User): Promise<void>` — reads the marker, calls `syncSessionAction({ idToken: await user.getIdToken(), refreshToken: user.refreshToken })` only when needed; concurrent calls for the same `user.refreshToken` share one promise; a failed sync is reported via `reportError` and resolves (never rejects).
- Exported from the `firebaseAuthClient` entry point so consumers with their own sign-in code (CRV `auth_actions.ts`) can await it.

- [ ] **Step 1: Write the failing tests**
  - `needsSessionSync`: absent → true; 21 % left → false; 19 % left → true; hash mismatch → true.
  - `it('makes no server call when the marker is fresh and matches')`.
  - `it('shares one in-flight sync between concurrent callers')` → `syncSessionAction` called once for two calls.
  - `it('resolves and reports when the sync action throws')`.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/client/session_sync.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): sync session cookies only when needed`

---

### Task 3: Provider and sign-in helpers use the sync

Behavior change: the provider stops writing `__fa_session__` / `__fa_refresh_token__` / the marker from JS.

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx` (`writeSession`, `clearSession`; `reloadUser` drops the `iat` retry against the unreadable session cookie and calls `ensureSessionSynced`)
- Modify: `src/firebase_auth/client/auth_actions.ts` (`createLoginAction`, `createSignUpAction`, `completeSignInWithLink`: await `ensureSessionSynced(auth.currentUser)` after the Firebase call resolves)
- Modify: package entry exports for `ensureSessionSynced`
- Test: `auth_user_provider.test.tsx`, `auth_actions.test.ts`

**Interfaces:**
- Consumes: `ensureSessionSynced` (Task 2).

- [ ] **Step 1: Write the failing tests**
  - `it('does not write session or refresh cookies from the client')` — after a user callback `document.cookie` has no `__fa_session__` / `__fa_refresh_token__` / `__fa_has_session__` writes; `syncSessionAction` called once.
  - `it('login action resolves only after the session sync')` — `syncSessionAction` stubbed with a deferred promise; the action's promise is still pending until it resolves.
  - same for sign-up and email-link sign-in.
- [ ] **Step 2: Run** both files — new tests FAIL; list every old test that asserted client-side session/refresh writes or the `iat` retry.
- [ ] **Step 3: Implement**; update the listed old tests and name them in the commit body.
- [ ] **Step 4: Run** `npx vitest run src/firebase_auth` — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth)!: write session cookies only from the server`

---

### Task 4: `restoreSessionAction`

**Files:**
- Create: `src/firebase_auth/server/sign_service_account_jwt.ts` (extracted from `mint_server_app_check_token.ts`'s local/remote signing branch)
- Modify: `src/firebase_auth/server/mint_server_app_check_token.ts` (use the extracted signer; no behavior change)
- Create: `src/firebase_auth/server/restore_session_action.ts` (`"use server"`)
- Test: `sign_service_account_jwt.test.ts`, `restore_session_action.test.ts`; existing `mint_server_app_check_token.test.ts` stays green

**Interfaces:**
- Produces: `export default async function signServiceAccountJwt(appCheck: FirebaseAppCheckConfig, claims: Record<string, unknown>): Promise<string>` — throws when credentials are missing.
- Produces: `export type RestoreSessionResult = { status: 'restored'; customToken: string } | { status: 'no-session' } | { status: 'invalid' } | { status: 'unavailable' }`.
- Produces: `export default async function restoreSessionAction(): Promise<RestoreSessionResult>` — reads the refresh cookie (`no-session` if absent); `refreshIdToken(..., { skipCache: true })`: `invalid` → also deletes the pair + marker, `transient-failure` → `unavailable`; takes `uid` from the new ID token's `sub`; writes the refreshed pair + marker; signs the custom token (signing failure → `unavailable`).

- [ ] **Step 1: Write the failing tests** — one per result status; claims match the Global Constraints exactly.
- [ ] **Step 2: Run** the new files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/firebase_auth/server` — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): restore a client session from the server session`

---

### Task 5: Provider restores on a split instead of logging out

Behavior change (replaces plan A Task 3's clear): an SDK null while the marker is set first tries `restoreSessionAction`.

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx` (null branch of the listener)
- Test: `src/firebase_auth/client/auth_user_provider.test.tsx`

**Interfaces:**
- Consumes: `restoreSessionAction` (Task 4), `hasServerSessionMarker`, `signInWithCustomToken` from `getFirebaseAuthModule()`.
- Behavior: while a restore is in flight `loading` stays `true` and no redirect fires. `restored` → `signInWithCustomToken`; the listener then emits the user (and Task 3's sync replaces the pair, since the refresh token changed). `invalid` / `no-session` → `clearSession(..., true)` and the normal signed-out path. `unavailable` or `signInWithCustomToken` rejecting → signed-out locally, server pair kept. One attempt per mounted provider (`useRef`).

- [ ] **Step 1: Write the failing tests** — `it('restores the user instead of redirecting when the marker is set')`; `it('keeps loading true while the restore is in flight')`; `it('clears the server session and redirects when restore answers invalid')`; `it('keeps the server pair when restore is unavailable')`; `it('attempts restore at most once per mount')`.
- [ ] **Step 2: Run** the file with `-t "restore"` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): recover from an SDK sign-out with the server session`

---

### Task 6: Release + CRV integration

- [ ] **Step 1:** `npx vitest run && npm run build` — PASS. Bump minor version (breaking client cookie behavior noted in CHANGELOG), commit `chore(release): <version>`.
- [ ] **Step 2:** CRV: bump the package; in `src/shared/components/auth/auth_actions.ts` await `ensureSessionSynced(auth.currentUser)` after `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`, and in `change_password_client_form.tsx` after `updatePassword`; remove the direct `setCookie({ name: defaultSessionCookieName, ... })` on the wrong-site refusal (the refusal path now clears through `clearSessionAction`); `npm run dev`.
- [ ] **Step 3:** CRV repro, each expected result checked in DevTools:
  - fresh login → one `syncSessionAction` POST, HttpOnly `__fa_session__` / `__fa_refresh_token__` in its `Set-Cookie`, nothing in `document.cookie` but the marker;
  - reload pages for a while → no further sync POSTs;
  - change password → one sync POST, marker hash changes;
  - block `firebaseappcheck` once after aging IndexedDB → `restoreSessionAction` runs, user stays on the page, no `/login` in the navigation log;
  - UI Log out → lands on `/login` and stays; no marker or session pair left.
