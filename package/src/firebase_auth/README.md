# `src/firebase_auth`

Optional module, active only when `firebaseAuth` is set on the `RoutingConfig`
passed to `setIntlConfig` (see `../config/README.md`). Every exported
function/component calls `require_config.ts`'s `requireFirebaseAuthConfig`
first, which throws a descriptive error instead of no-op'ing if that config is
missing — this is the first thing to check when a firebase_auth call throws
unexpectedly.

## Layout

- `client/` — browser-side: `firebase_client.ts` (lazy SDK getter),
  `use_auth_user.ts` (`onIdTokenChanged` hook), `auth_user_cache.ts`,
  `auth_user_provider.tsx` (context provider, syncs session cookie, and
  invokes the optional `onSignIn`/`onEmailVerified`/`onSignOut`
  `firebaseAuth` config callbacks exactly once per real transition — see
  their doc comments on `FirebaseAuthRoutingConfig` in `types/types.ts`),
  `auth_actions.ts` (login/signup/forgot-password `useActionState` factories).
- `server/` — RSC-side: `use_auth_user_server.ts`, `firebase_server.ts`,
  `auth_user_server_provider.tsx` (not used by the default auto-wiring path —
  see its doc comment for why).

  When `appCheck` is configured AND App Check enforcement is on for Auth in
  the Firebase console, `initializeServerApp` rejects every call with
  `auth/firebase-app-check-token-is-invalid` unless it is handed an
  `appCheckToken` — the client SDK's own App Check init does nothing for the
  server. `AuthUserProvider` therefore mirrors the live App Check token into
  a client-readable `appCheckTokenCookieName` cookie (default
  `__fa_app_check_token__`, max-age `appCheckTokenCookieMaxAge` / 1hr to
  match the token's own lifetime), which `firebase_server.ts` reads and
  forwards. Absent cookie = App Check validation skipped, same as before.

  That cookie is only as fresh as the client's last write, so a cold
  navigation (fresh tab, hard refresh, external link) renders on the server
  before `AuthUserProvider` has run at all — the exact rejection the cookie
  exists to prevent, for an otherwise genuinely signed-in user (proven by a
  valid session cookie). `mint_server_app_check_token.ts` covers that gap:
  when the App Check cookie is absent, `firebase_server.ts` mints one
  server-side via a service-account custom-token exchange (`jose`-signed,
  Edge-runtime-safe, no `firebase-admin`), gated on
  `appCheck.clientEmail`/`privateKey`/`appId` all being set — omit any of
  them to skip minting and keep the cookie-or-nothing behavior. Not cached
  beyond `getAuthenticatedAppForUser`'s own request-scoped `cache()`; a fresh
  mint costs one signing op plus one round-trip to Google per request that
  needs it.
- `middleware/update_session.ts` — refreshes the session cookie and drives
  the guest/auth-page/unverified-email redirects (`redirectAuthPath` /
  `homePath` / `verifyEmailPath`, the last checked via the session token's
  `email_verified` claim, skipped when unset). That claim is only as fresh
  as the last ID-token mint (up to ~1hr stale); a client-written
  `emailVerifiedHintCookieName` cookie (default `__fa_email_verified_hint__`,
  set by `AuthUserProvider` on every auth-state change) lets the middleware
  detect when the claim is likely stale and force one refresh before
  trusting it, without paying a refresh on every request for a genuinely
  unverified user. Called automatically by `../config/middleware.ts`'s
  default handler, not meant to be invoked directly by consumers.

  Also forwards emailed Firebase action links: Firebase Console exposes only
  ONE project-wide action URL, so every template (reset/verify/recover)
  lands there distinguished only by `?mode=`. This runs BEFORE the guest
  redirect above — a signed-out user following the link must not get bounced
  to `redirectAuthPath` and lose their `oobCode` — and forwards to
  `resetPasswordPath` / `verifyEmailPath` / `recoverEmailPath` /
  `actionModePaths` for the matching mode, preserving the full query string.
  `actionLinkPath`, if set, restricts this to one exact static path (a
  Console action URL pinned to a path, e.g. `/auth/action`, instead of the
  bare domain root); `actionLinkRedirectEnabled: false` turns it off.
- `error_messages/` — `firebase_auth_error_helper.ts` maps Firebase error
  codes to user-facing strings; `default_messages.en.ts` is the default set,
  overridable via `AuthActionMessages`.
- `types.ts` — `SerializedAuthUser` (RSC-serializable projection of
  `firebase/auth`'s `User`, used for first paint before the client's
  `onIdTokenChanged` listener fires and supersedes it with the real `User`).

## Gotchas

- `index.ts` deliberately does NOT re-export a single `useFirebaseAuthUser` —
  the barrel is a plain module graph and can't replicate the
  react-server/default export-condition split that the
  `cloudflare-next-intl/useFirebaseAuthUser` subpath provides. Import that
  subpath directly for the environment-resolving hook; the barrel only
  exposes the explicit `useFirebaseAuthUserClient` / `useFirebaseAuthUserServer`.
- Client and server hooks throw `"useAuthUser must be used within an
  AuthUserProvider"` if called outside their respective provider.
