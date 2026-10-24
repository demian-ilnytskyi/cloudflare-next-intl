# firebase_auth session hardening — spec

## Problem (reproduced 2026-10-23 on CRV `npm run dev`, Firebase project clarivant-2)

1. **Random logout.** After idle, the client SDK needs a fresh App Check token before
   `accounts:lookup`. App Check is enforced on identitytoolkit (`accounts:lookup`,
   `signInWithPassword`); `securetoken` is not. When reCAPTCHA/App Check fails, lookup
   answers `401 "Firebase App Check token is invalid"`, `@firebase/auth`
   (`reloadAndSetCurrentUserOrClear`) deletes the IndexedDB user, `AuthUserProvider`
   redirects to `/login` on that first null (consumers without `initialUser` start with
   `confirmedSignedOut = true`), and only the JS-visible cookies are cleared. The
   HttpOnly session/refresh pair survives: server says signed in, client says signed out.
2. **Login flash, then home.** Whenever the middleware sees no usable session cookie
   pair while IndexedDB still holds a user: 307 to `/login`, SDK restores the user
   (≈0.7 s dev, 2–3 s prod with reCAPTCHA), provider replaces back to `homePath`.
   Ways the pair goes missing or stale:
   - session/refresh cookies are written by `document.cookie` until the first
     middleware refresh; Safari ITP caps script-written cookies (7 d, 24 h after a
     link-decorated cross-site navigation);
   - once the middleware wrote them HttpOnly, every later client write of the same
     names is silently dropped (reproduced after re-login), so the server keeps an
     old refresh token that a password change / revoke later invalidates.
3. **Slow user.** The first `onIdTokenChanged` fires only after App Check exchange →
   `securetoken` → `accounts:lookup` (dev: 378 + 167 + 182 ms; prod adds reCAPTCHA
   load + execute with no timeout below auth's 30/60 s `NetworkTimeout`). Then
   `writeSession` awaits the App Check cookie sync before `setState`. Server side, a
   missing App Check cookie makes every request mint one (measured +0.7–1 s per
   request); an expired one makes the server resolve a null user.
4. `sessionCookieOptions(fa, request.nextUrl.protocol === 'https')` is always `false`
   (`URL.protocol` is `'https:'`): server cookies never get `Secure`.

## Decisions

- **Server owns the session cookies.** The client never writes `__fa_session__` /
  `__fa_refresh_token__`. It calls the server action `syncSessionAction`, which sets
  the HttpOnly `Secure` pair, but only when needed: the readable marker cookie
  `__fa_has_session__` (`${expiresAt}.${hash}`, `hash` = first 8 hex chars of
  SHA-256 of the refresh token) is absent, has less than 20 % of the refresh-cookie
  lifetime left, or its hash differs from the SDK's current refresh token. Sign-in
  helpers await that sync before the caller navigates.
- **Keep the ID-token session.** Firebase session cookies (`createSessionCookie`) are
  rejected: `initializeServerApp` and the consumer's Supabase calls need a real ID
  token.
- **Consistent sign-out.** The same marker means "the server holds a session pair".
  An SDK null while the marker is set is a split, never a plain signed-out state.
- **Recovery instead of logout.** On a split the client calls `restoreSessionAction`;
  the server refreshes from its HttpOnly refresh cookie and returns a Firebase custom
  token; the client `signInWithCustomToken`s. Only if that fails is the server pair
  cleared and the user sent to `redirectAuthPath`.
- **App Check off the cold path.** The middleware mints an App Check token
  (existing `mintServerAppCheckToken`) for requests carrying a valid session and no
  App Check cookie, and writes it with `maxAge` = the token's remaining lifetime. The
  client `CustomProvider` returns that cookie's token while valid and only then falls
  back to reCAPTCHA, which gets its own timeout.
- **Device binding (opt-in).** `firebaseAuth.deviceBinding.store` (get/put adapter,
  e.g. Workers KV). On sign-in the client creates a non-extractable ECDSA P-256 key in
  IndexedDB and sends its public JWK in `syncSessionAction`, which stores it under the
  refresh token's hash. Refreshing a bound session and
  `restoreSessionAction` require a fresh proof cookie signed by that key. A copied
  cookie set works for at most the proof lifetime.

## Out of scope

- Changing `@firebase/auth` behavior on App Check 401 (not configurable).
- DBSC (Chrome-only).
