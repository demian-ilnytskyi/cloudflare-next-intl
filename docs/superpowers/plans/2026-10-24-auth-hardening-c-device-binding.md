# Auth hardening C — device-bound sessions (opt-in)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A copied cookie set stops working on another device after at most the proof lifetime: refreshing a bound session, and restoring one, needs a signature from a non-extractable key that never leaves the original browser.

**Architecture:** On sign-in the client creates an ECDSA P-256 key pair with a non-extractable private key, keeps it in IndexedDB, and sends the public JWK in `syncSessionAction`, which stores it under the refresh token's SHA-256 in a consumer-supplied store and marks the session marker as bound. The client keeps a short-lived proof cookie, `${ts}.${signature}`, fresh; every server-side refresh verifies it through one guarded function.

**Tech Stack:** Web Crypto (`crypto.subtle` ECDSA P-256 / SHA-256, available in Safari, Chrome and Workers), IndexedDB, vitest 3; add `fake-indexeddb` as a devDependency in Task 1 (not present today) — the only new package in this plan.

**Spec:** `docs/superpowers/specs/2026-10-24-firebase-auth-session-hardening.md`

**Depends on:** plan B merged (`SyncSessionInput.devicePublicJwk`, `needsSessionSync`, `ensureSessionSynced`, `restoreSessionAction`).

## Global Constraints

- All Global Constraints of plans A and B apply.
- Off unless `firebaseAuth.deviceBinding` is set; with it unset every code path is byte-for-byte today's behavior.
- In `src/types/types.ts`: `export interface DeviceBindingStore { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }` and `export interface DeviceBindingConfig { store: DeviceBindingStore; proofMaxAgeSeconds?: number }`; `FirebaseAuthConfig.deviceBinding?: DeviceBindingConfig`; default `proofMaxAgeSeconds` = `3600`.
- Store key: `fa-device:${sha256hex(refreshToken)}`; value: `JSON.stringify(publicJwk)`.
- Proof cookie: `__fa_device_proof__` (export `defaultDeviceProofCookieName`), not HttpOnly, `sameSite: 'lax'`, `path: '/'`, `maxAge = proofMaxAgeSeconds`; value `${ts}.${base64url(signature)}` where `ts` = Unix seconds and the signed message is `${ts}.${sha256hex(refreshToken)}`; ECDSA `{ name: 'ECDSA', hash: 'SHA-256' }`.
- Accept a proof when `now - 60 <= ts + proofMaxAgeSeconds` and `ts <= now + 60` (60 s clock skew).
- Store failures fail OPEN (treat as `unbound`) and are reported via `reportError`, matching CRV's denylist policy.

## Review Focus

- A user whose session predates binding (no store entry) keeps refreshing normally and gets bound on the next sign-in (Task 3 test).
- First load after long idle: proof expired → no server refresh; the page must not bounce to `/login` and must not render signed-out UI — consumers render a skeleton while `isAuthProofPending()` is true; the client writes a proof and calls `router.refresh()` once (Tasks 4–5 tests).
- Device key missing while the SDK user is alive (key DB cleared alone, or key creation failed earlier): re-bind when the ID token's `auth_time` is fresh; otherwise ask the user to sign in again (`reauthenticate`), never a silent re-bind of an old session — a stolen refresh token could otherwise re-bind itself to the attacker's key (Tasks 3, 5 tests).
- Private mode / WebViews where IndexedDB or `crypto.subtle` throws: sessions stay unbound and work, and the client must not re-sync on every callback trying to bind (Tasks 1, 3 tests).
- Multi-tab: only an explicit `logout()` resets the device key; an SDK null in one tab never does (Task 5 test).
- The RSC safety-net refresh and `retryWithFreshToken` in `firebase_server.ts` and `restoreSessionAction` must all enforce the proof, or a copied cookie bypasses the middleware check (Task 4 tests).
- Store outage: sessions keep working (fail open), one report per minute at most (Task 4 test).

---

### Task 1: Client device key

**Files:**
- Create: `src/firebase_auth/client/device_key.ts`
- Test: `src/firebase_auth/client/device_key.test.ts`

**Interfaces:**
- Produces: `export interface DeviceKey { publicJwk: JsonWebKey; sign(message: string): Promise<string> }` (`sign` returns base64url).
- Produces: `export async function getDeviceKey(create: boolean): Promise<DeviceKey | null>` — IndexedDB database `fa-device-key`, store `keys`, record `'current'` holding the `CryptoKeyPair`; `generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])`; `null` when absent and `create` is false, or when IndexedDB / `crypto.subtle` is missing or throws (`SecurityError`, `InvalidStateError`, quota) — every IndexedDB and `crypto.subtle` call sits inside one `try/catch`; never rejects.
- Produces: `export function isDeviceKeyUnsupported(): boolean` — `true` after any `getDeviceKey` call hit the unavailable path in this page load.
- Produces: `export async function resetDeviceKey(): Promise<void>` (never rejects).

- [ ] **Step 1: Write the failing tests** — `getDeviceKey(true)` twice returns the same `publicJwk`; `privateKey.extractable === false`; a signature verifies with `crypto.subtle.verify` against `publicJwk`; `getDeviceKey(false)` after `resetDeviceKey()` is `null`; `indexedDB.open` throwing `SecurityError` → `getDeviceKey(true)` resolves `null` and `isDeviceKeyUnsupported() === true`; `crypto.subtle` undefined → same.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/client/device_key.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): add a non-extractable device key`

---

### Task 2: Proof codec and verifier

**Files:**
- Create: `src/firebase_auth/device_proof.ts`
- Modify: `src/types/types.ts` (`DeviceBindingStore`, `DeviceBindingConfig`)
- Test: `src/firebase_auth/device_proof.test.ts`

**Interfaces:**
- Produces: `export async function sha256Hex(value: string): Promise<string>`.
- Produces: `export async function createDeviceProof(key: DeviceKey, refreshToken: string, nowSeconds: number): Promise<string>`.
- Produces: `export type DeviceProofVerdict = 'ok' | 'unbound' | 'missing' | 'invalid'`.
- Produces: `export async function verifyDeviceProof(binding: DeviceBindingConfig, refreshToken: string, proof: string | undefined, nowSeconds: number): Promise<DeviceProofVerdict>` — `unbound` when the store has no entry or the store throws; `missing` when proof absent; `invalid` on bad format, window miss, or failed signature.

- [ ] **Step 1: Write the failing tests** — one per verdict; window edges at exactly `ts + proofMaxAgeSeconds + 60` (ok) and `+61` (invalid); `ts = now + 61` invalid; a proof for refresh token A rejected for B; store `get` throwing → `unbound` and `reportError` called.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): sign and verify device proofs`

---

### Task 3: Bind on sync, unbind on sign-out

**Files:**
- Modify: `src/firebase_auth/server/sync_session_action.ts`
- Modify: `src/firebase_auth/session_marker.ts` (optional third segment `b`: `${expiresAt}.${hash}.b` = bound)
- Modify: `src/firebase_auth/client/session_sync.ts` (`needsSessionSync` also true when `deviceBinding` is set, the marker is not bound, and `!isDeviceKeyUnsupported()`)
- Modify: `src/firebase_auth/server/clear_session_action.ts`
- Modify: `src/types/types.ts` (`deviceProofCookieName?`, `onReauthRequired?: () => void | Promise<void>`)
- Test: `sync_session_action.test.ts`, `session_marker.test.ts`, `session_sync.test.ts`, `clear_session_action.test.ts`

**Interfaces:**
- Consumes: `SyncSessionInput.devicePublicJwk`, `sha256Hex`.
- Produces: `export const REBIND_MAX_AUTH_AGE_SECONDS = 300`; `SyncSessionResult` gains `{ status: 'rebind-refused' }`.
- Behavior: sync with `devicePublicJwk` and `deviceBinding` set → if the store has no entry for this refresh token, `store.put(key, jwk)` and a bound marker; if it has the SAME jwk, no write; if it has a DIFFERENT jwk, overwrite only when the ID token's `auth_time` is at most `REBIND_MAX_AUTH_AGE_SECONDS` old, otherwise return `rebind-refused` and write nothing. Sync without a JWK leaves the store untouched and writes an unbound marker. `clearSessionAction` → `store.delete` for the current refresh cookie's key.

- [ ] **Step 1: Write the failing tests** — `it('stores the device key when the sync carries one')`; `it('does not touch the store when deviceBinding is unset')`; `it('re-syncs an unbound session once binding is enabled')`; `it('does not re-sync forever when the device key is unsupported')`; `it('re-binds a new key when auth_time is fresh')`; `it('refuses to re-bind a new key for an old auth_time')`; `it('deletes the binding on clearSessionAction')`; `it('keeps refreshing an unbound legacy session')`.
- [ ] **Step 2: Run** both files with `-t "device"` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): bind sessions to the device key on sign-in`

---

### Task 4: Every server refresh checks the proof

**Files:**
- Create: `src/firebase_auth/guarded_refresh.ts`
- Modify: `src/firebase_auth/middleware/update_session.ts` (all three `refreshIdToken` call sites)
- Modify: `src/firebase_auth/server/firebase_server.ts` (safety net + `retryWithFreshToken`)
- Modify: `src/firebase_auth/server/restore_session_action.ts`
- Test: `guarded_refresh.test.ts`; additions to `update_session.test.ts`, `firebase_server.test.ts`, `restore_session_action.test.ts`

**Interfaces:**
- Consumes: `verifyDeviceProof`, `refreshIdToken`.
- Produces: `export type GuardedRefreshResult = RefreshResult | { status: 'proof-required' }`.
- Produces: `export async function guardedRefresh(fa, refreshToken: string, proof: string | undefined, options?: { skipCache?: boolean }): Promise<GuardedRefreshResult>` — `deviceBinding` unset → plain `refreshIdToken`; verdict `ok`/`unbound` → refresh; `missing`/`invalid` → `proof-required` without calling Google.
- Produces: `export async function isAuthProofPending(): Promise<boolean>` (server, reads `__fa_proof_required__` via `cookies()`), exported next to `getAuthUser` so consumers render a skeleton instead of signed-out UI.
- Behavior: middleware treats `proof-required` like `transient-failure` (pass through, no redirect, no cookie clear) and sets a non-HttpOnly `__fa_proof_required__=1` (`maxAge: 60`) on BOTH the response and `request.cookies` (rebuilt response) so this same render sees it; `firebase_server.ts` resolves a null user; `restoreSessionAction` returns a new status `{ status: 'proof-required' }`.

- [ ] **Step 1: Write the failing tests** — `guardedRefresh` per verdict (Google `fetch` not called on `proof-required`); middleware sets `__fa_proof_required__` on response and forwarded request and does not redirect; `isAuthProofPending()` true in that render; RSC safety net does not refresh without a proof; restore answers `proof-required`.
- [ ] **Step 2: Run** the four files with `-t "proof"` — FAIL.
- [ ] **Step 3: Implement**; replace each direct `refreshIdToken` call with `guardedRefresh`.
- [ ] **Step 4: Run** `npx vitest run src/firebase_auth` — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): require a device proof to refresh a bound session`

---

### Task 5: Client keeps the proof fresh

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx`
- Test: `src/firebase_auth/client/auth_user_provider.test.tsx`

**Interfaces:**
- Consumes: `getDeviceKey`, `createDeviceProof`, `ensureSessionSynced` (passes `devicePublicJwk`), `restoreSessionAction` `proof-required` status.
- Behavior (only with `deviceBinding` set):
  - user callback that needs a sync → `getDeviceKey(true)`, `syncSessionAction` receives `devicePublicJwk`;
  - every user callback and every `proofMaxAgeSeconds / 2` while mounted → write the proof cookie;
  - on mount, `__fa_proof_required__` present and a device key exists → write proof, delete the flag, `router.refresh()` once; `loading` stays `true` until that refresh commits;
  - restore answers `proof-required` → write proof and retry restore once;
  - only the explicit `logout()` calls `resetDeviceKey()`; an SDK null (any tab) never does;
  - no device key (`getDeviceKey(false) === null`) while the server asks for a proof and the SDK user is alive → `getDeviceKey(true)` + sync with the new JWK; `synced` → write proof + `router.refresh()`; `rebind-refused` → `reauthenticate` hook: `fa.onReauthRequired?.()` if set, else the normal signed-out path with the server pair cleared;
  - no device key and no SDK user → normal signed-out path.

- [ ] **Step 1: Write the failing tests** — one per bullet, each asserting the cookie written or the call made; `it('calls router.refresh at most once per mount for proof-required')`; `it('does not reset the device key on an SDK null')`; `it('re-binds a lost key after a fresh sign-in')`.
- [ ] **Step 2: Run** the file with `-t "device"` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): keep the device proof cookie fresh`

---

### Task 6: Release + CRV integration

- [ ] **Step 1:** `npx vitest run && npm run build` — PASS; bump minor, CHANGELOG, commit `chore(release): <version>`.
- [ ] **Step 2:** CRV: add `src/shared/repositories/device_binding_repository.ts` implementing `DeviceBindingStore` over `VINEXT_KV_CACHE` with prefix `device-binding:` (same namespace pattern and try/catch policy as `session_denylist_repository.ts`, no TTL), pass it as `firebaseAuth.deviceBinding.store` in `src/l18n/intl_config.ts`; repository tests alongside. In the `(app)` layout, render the existing page skeleton instead of the signed-out shell while `await isAuthProofPending()` is true.
- [ ] **Step 3:** CRV repro on `npm run dev`:
  - sign in → KV has `device-binding:fa-device:<hash>`;
  - copy `__fa_session__`, `__fa_refresh_token__`, `__fa_device_proof__` into a second isolated browser context after the proof expired (shorten `proofMaxAgeSeconds` to 120 for the test) and age the session → no refresh, signed-out render; original browser keeps working;
  - original browser after aging the proof + session → skeleton, then one `router.refresh()`, user stays signed in, no `/login`, no signed-out UI frame;
  - delete only the `fa-device-key` IndexedDB in the original browser → old session: one re-sync answered `rebind-refused`, sign-in prompt; right after a fresh sign-in → re-bind succeeds silently;
  - incognito window → sign-in works, sessions unbound, no repeated `syncSessionAction` POSTs.
