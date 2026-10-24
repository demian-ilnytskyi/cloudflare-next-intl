# Auth hardening A — correctness and latency fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop App Check hiccups from splitting client and server auth state, take App Check off the cold-start critical path, and stop blocking `loading` on cookie sync.

**Architecture:** Targeted fixes inside `packages/cloudflare-next-intl/src/firebase_auth`. A new non-HttpOnly marker cookie tells the client whether the server holds a session. The middleware seeds the App Check cookie with a server-minted token, the client provider prefers it, and reCAPTCHA gets a hard timeout.

**Tech Stack:** TypeScript, Next.js middleware API (vinext on Cloudflare Workers), `@firebase/auth` 1.13, `@firebase/app-check` 0.13, vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-24-firebase-auth-session-hardening.md`

## Global Constraints

- Every existing test in `src/firebase_auth/**` keeps passing; change an existing assertion only where a task below says that behavior changes, and say so in the commit body.
- Commands run from `packages/cloudflare-next-intl`.
- No new runtime dependencies.
- No code comments added except where the surrounding file already explains a non-obvious branch the same way (match density of `update_session.ts`).
- Cookie names are exported constants from `middleware/update_session.ts`; every new cookie gets a `default…CookieName` export and an optional override on `FirebaseAuthConfig` in `src/types/types.ts`.
- Commit messages: Conventional Commits, no tool attribution lines.
- Add a CHANGELOG entry under the next patch version for each task.

## Review Focus

- Plain-http local dev (`http://localhost`) must still receive cookies → `secure` stays `false` there (Task 1 test).
- Prefetch requests must never get the App Check mint or a `Set-Cookie` with it (Task 4 test).
- Mint failure in middleware must not block or redirect the request (Task 4 test).
- A user signed in on whitelisted pages only (`deferAuthSubscribe`) must not trigger the split clear (Task 3 test).
- Expired App Check cookie must never be handed to `initializeServerApp` (Task 4 test).

---

### Task 1: `Secure` flag on server-written cookies

**Files:**
- Modify: `src/firebase_auth/middleware/update_session.ts:549`
- Test: `src/firebase_auth/middleware/update_session.test.ts`

**Interfaces:**
- Produces: `export function isSecureRequest(request: NextRequest): boolean` in `update_session.ts` — `request.nextUrl.protocol === 'https:'`. Later tasks use it for every cookie write.

- [ ] **Step 1: Write the failing tests** — `it('marks refreshed cookies Secure on an https request')`: https request, expired session, refresh stubbed to succeed → `response.cookies.get('__fa_session__')?.secure === true` and same for `__fa_refresh_token__`. `it('keeps refreshed cookies non-Secure on plain http')` → `secure` falsy.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/middleware/update_session.test.ts -t "Secure"` — expect the https test to FAIL.
- [ ] **Step 3: Implement** `isSecureRequest` and use it at line 549.
- [ ] **Step 4: Run** the same command — PASS; then the whole file — PASS.
- [ ] **Step 5: Commit** `fix(firebase_auth): set Secure on session cookies over https`

---

### Task 2: Session marker cookie

**Files:**
- Create: `src/firebase_auth/session_marker.ts`
- Modify: `src/firebase_auth/middleware/update_session.ts` (cookie constant, set on refresh, delete on `clearInvalidSession`)
- Modify: `src/firebase_auth/server/clear_session_action.ts`
- Modify: `src/firebase_auth/client/auth_user_provider.tsx` (`writeSession`, `clearSession`)
- Modify: `src/types/types.ts` (`sessionMarkerCookieName?: string`)
- Test: `session_marker.test.ts`, `update_session.test.ts`, `clear_session_action.test.ts`, `client/auth_user_provider.test.tsx`

**Interfaces:**
- Produces: `export const defaultSessionMarkerCookieName = '__fa_has_session__'`; attributes: not HttpOnly, `sameSite: 'lax'`, `path: '/'`, `secure: isSecureRequest(...)`, `maxAge` = refresh cookie max age.
- Produces in `session_marker.ts`: `export async function refreshTokenHash(refreshToken: string): Promise<string>` (first 8 hex chars of SHA-256 via `crypto.subtle`); `export async function encodeSessionMarker(expiresAtSeconds: number, refreshToken: string): Promise<string>` → `${expiresAtSeconds}.${hash}`; `export function decodeSessionMarker(value: string | undefined): { expiresAt: number; hash: string } | null`. Plan B's sync decision and plan C's binding flag build on this format.
- Produces: `export function hasServerSessionMarker(): boolean` in `client/auth_user_provider.tsx` (`decodeSessionMarker(getCookie(...)) !== null`).

- [ ] **Step 1: Write the failing tests**
  - codec: round trip; `decodeSessionMarker('x') === null`; hash is 8 lowercase hex chars and differs for two refresh tokens.
  - middleware: `it('writes the session marker alongside a refreshed pair')` → marker decodes, `expiresAt` within 5 s of `now + refreshMaxAge`, hash matches the new refresh token, `httpOnly` falsy.
  - middleware: `it('deletes the session marker when the refresh token is invalid')`.
  - action: `it('deletes the session marker')` → `cookieStore.delete` called with `'__fa_has_session__'`.
  - provider: `it('writes the session marker in writeSession and clears it in clearSession')` → `document.cookie` has a decodable `__fa_has_session__` after a user callback, absent after a null callback (plan B moves this write to the server).
- [ ] **Step 2: Run** the three files — the new tests FAIL.
- [ ] **Step 3: Implement** constant, config override, writes and deletes.
- [ ] **Step 4: Run** the three files — PASS.
- [ ] **Step 5: Commit** `feat(firebase_auth): add a non-HttpOnly session marker cookie`

---

### Task 3: An SDK null after a server session clears the server pair too

Behavior change: today the first `onIdTokenChanged(null)` with no `initialUser` clears only JS cookies (`clearServerCookies = previous ?? (initialSignedIn || isAuthPage)` is `false`). After this task, a null while `hasServerSessionMarker()` is true always runs `clearSessionAction`, so state never splits. (Plan B replaces the clear with a restore attempt.)

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx:236-245`
- Test: `src/firebase_auth/client/auth_user_provider.test.tsx`

**Interfaces:**
- Consumes: `hasServerSessionMarker()` (Task 2).
- Produces: `function shouldClearServerCookies(previous: boolean | undefined, initialSignedIn: boolean, isAuthPage: boolean): boolean` — `true` when `hasServerSessionMarker()` or the existing expression is true.

- [ ] **Step 1: Write the failing tests**
  - `it('clears the server session when the first callback is null but the marker is set')` — `initialUser` omitted, marker cookie set, listener emits `null` → `clearSessionAction` called once.
  - `it('does not call clearSessionAction for a never-signed-in visitor')` — no marker, null → not called (pins current behavior).
  - `it('does not clear on a deferred whitelisted page without a marker')`.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/client/auth_user_provider.test.tsx -t "server session"` — first test FAILS.
- [ ] **Step 3: Implement** `shouldClearServerCookies` and pass it to `clearSession`.
- [ ] **Step 4: Run** the file — PASS.
- [ ] **Step 5: Commit** `fix(firebase_auth): clear the server session when the SDK drops the user`

---

### Task 4: Middleware seeds the App Check cookie with a real expiry

**Files:**
- Create: `src/firebase_auth/middleware/seed_app_check_cookie.ts`
- Modify: `src/firebase_auth/middleware/update_session.ts` (call it on the pass-through path when `hasSession`)
- Modify: `src/firebase_auth/server/firebase_server.ts:97-98` (ignore an expired App Check cookie)
- Modify: `src/firebase_auth/client/auth_user_provider.tsx:66-73` (`maxAge` from token `exp`)
- Test: `src/firebase_auth/middleware/seed_app_check_cookie.test.ts`, `firebase_server.test.ts`, `auth_user_provider.test.tsx`

**Interfaces:**
- Consumes: `mintServerAppCheckToken(projectId, apiKey, appCheck)` from `server/mint_server_app_check_token.ts`; `decodeJwtPayload`; `isSecureRequest` (Task 1).
- Produces: `export default async function seedAppCheckCookie(request: NextRequest, response: NextResponse, fa: NonNullable<typeof config.firebaseAuth>): Promise<void>` — no-op when `fa.appCheck` unset, when the request is a prefetch, or when the request's App Check cookie decodes with `exp` more than 5 min ahead; otherwise mints, and on success sets the cookie (not HttpOnly, `sameSite: 'lax'`, `path: '/'`, `secure: isSecureRequest`) with `maxAge = exp - now - 60` seconds and writes the token onto `request.cookies` so the render sees it. Swallows mint errors.
- Produces: `export function isAppCheckTokenUsable(token: string | undefined, nowMs?: number): boolean` in `seed_app_check_cookie.ts` (`exp*1000 - now > 5 * 60 * 1000`), reused by `firebase_server.ts` and the client.

- [ ] **Step 1: Write the failing tests**
  - `it('mints and sets the cookie when the session is valid and no App Check cookie is present')` — stub `fetch` for the mint; `maxAge` within 60 s of the token's remaining lifetime.
  - `it('does nothing when the existing App Check cookie is usable')` — mint not called.
  - `it('re-mints when the existing App Check cookie expires within 5 minutes')`.
  - `it('never mints on a prefetch request')`.
  - `it('leaves the response untouched when the mint throws')`.
  - `firebase_server`: `it('mints instead of forwarding an expired App Check cookie')`.
  - provider: `it('writes the App Check cookie with maxAge from the token exp')`.
- [ ] **Step 2: Run** the three test files — new tests FAIL.
- [ ] **Step 3: Implement** `seedAppCheckCookie` + `isAppCheckTokenUsable`; call from `updateSession` after `refreshedToken` handling, only when `hasSession && !clearInvalidSession && !refreshWasTransientFailure`; apply to the rebuilt response when one exists.
- [ ] **Step 4: Run** the three files — PASS; then `npx vitest run src/firebase_auth` — PASS.
- [ ] **Step 5: Commit** `perf(firebase_auth): seed the App Check cookie from the middleware`

---

### Task 5: Client App Check provider prefers the seeded cookie, reCAPTCHA gets a timeout

**Files:**
- Modify: `src/firebase_auth/client/firebase_client.ts:148-180` (`createExplicitRecaptchaProvider`)
- Test: `src/firebase_auth/client/firebase_client.test.ts`

**Interfaces:**
- Consumes: `isAppCheckTokenUsable` (Task 4); `getCookie`; cookie name `fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName`.
- Produces: `export const RECAPTCHA_TOKEN_TIMEOUT_MS = 8_000`. `getToken` returns `{ token, expireTimeMillis: exp*1000 }` from the cookie when usable, without touching `grecaptcha`; otherwise runs the existing flow raced against `RECAPTCHA_TOKEN_TIMEOUT_MS` (reject `new Error('reCAPTCHA timed out')`).

- [ ] **Step 1: Write the failing tests**
  - `it('returns the seeded cookie token without loading reCAPTCHA')` — `window.grecaptcha` undefined, no `<script>` appended.
  - `it('falls back to reCAPTCHA when the seeded token expires within 5 minutes')`.
  - `it('rejects after RECAPTCHA_TOKEN_TIMEOUT_MS when grecaptcha.execute never settles')` — fake timers.
- [ ] **Step 2: Run** `npx vitest run src/firebase_auth/client/firebase_client.test.ts` — new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `perf(firebase_auth): use the server-seeded App Check token before reCAPTCHA`

---

### Task 6: `loading` no longer waits for cookie sync

Behavior change: `setAuthUserCache` + `setState({ user, loading: false })` run before `writeSession`, and `writeSession` stops awaiting `writeAppCheckTokenCookie` before the session cookie.

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx:92-111`, `:230-250`
- Test: `src/firebase_auth/client/auth_user_provider.test.tsx`

**Interfaces:**
- Unchanged exports. `writeSession` still resolves only after every cookie is written (callers that await it, like `reloadUser`, keep their guarantee).

- [ ] **Step 1: Write the failing tests**
  - `it('exposes the user before the App Check cookie sync settles')` — `getAppCheckToken` returns a never-resolving promise; after the listener emits a user, `useAuthUser()` reports `{ loading: false, user }`.
  - `it('writes the session cookie while the App Check sync is still pending')`.
- [ ] **Step 2: Run** the file with `-t "before the App Check"` — FAIL.
- [ ] **Step 3: Implement** — `writeAppCheckTokenCookie` runs concurrently (`Promise.all` with the session write).
- [ ] **Step 4: Run** the whole file — PASS (update any assertion that pinned the old ordering; name it in the commit body).
- [ ] **Step 5: Commit** `perf(firebase_auth): stop blocking loading on cookie sync`

---

### Task 7: Release + CRV verification

- [ ] **Step 1:** `npx vitest run && npm run build` — PASS.
- [ ] **Step 2:** Bump patch version, CHANGELOG entries from Tasks 1–6, commit `chore(release): <version>`.
- [ ] **Step 3:** In CRV bump `cloudflare-next-intl`, `npm run dev`, and re-run the repro from memory `auth_appcheck_logout_flash.md`: block `firebaseappcheck` once after aging IndexedDB → expected: no `accounts:lookup` 401 (seeded token used), user stays signed in; with the seeded cookie also deleted → logout is consistent (no home→login loop on the next load).
