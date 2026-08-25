# `src/firebase_auth`

Optional module, active only when `firebaseAuth` is set on the `RoutingConfig`
passed to `setIntlConfig` (see `../config/README.md`). Every exported
function/component calls `require_config.ts`'s `requireFirebaseAuthConfig`
first, which throws a descriptive error instead of no-op'ing if that config is
missing — this is the first thing to check when a firebase_auth call throws
unexpectedly.

## Performance Monitoring

Enabled by default: configuring `firebaseAuth` is enough, and
`getFirebaseAuthClient()` initializes `firebase/performance` on first
resolve. Automatic traces (page load, network requests) then collect with no
action from the consumer — nothing to render, call, or wire up.

Disable with an explicit `performance: false` on `firebaseAuth`. The check is
`fa.performance !== false`, so omitting the field means enabled; it is also
skipped when `window` is undefined, keeping the browser-only SDK out of
SSR/RSC. In either case `import('firebase/performance')` is never evaluated.

`AutoFirebasePerformanceEvents` is auto-rendered and auto-tracks Web Vitals,
SPA route-change duration, long tasks, and slow non-fetch resource loads as
Firebase Performance custom traces — nothing for the consumer to render or
call, same as the page-load/network traces above it.

## Layout

- `client/` — browser-side: `firebase_client.ts` (lazy SDK getter; also
  initializes Performance Monitoring — see below),
  `use_auth_user.ts` (`onIdTokenChanged` hook), `auth_user_cache.ts`,
  `auth_user_provider.tsx` (context provider, syncs session cookie, suppresses `redirectAuthPath` navigation on `logout()` for whitelisted paths, and
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
  server-side via a service-account custom-token exchange (Edge-runtime-safe,
  no `firebase-admin`), gated on `appCheck.clientEmail`/`appId` being set
  plus a way to sign — omit `clientEmail`/`appId` to skip minting and keep
  the cookie-or-nothing behavior. Not cached beyond
  `getAuthenticatedAppForUser`'s own request-scoped `cache()`; a fresh mint
  costs one signing op plus one round-trip to Google per request that needs
  it.

  Two ways to sign, `privateKey` taking priority when both are set:
  - **`appCheck.privateKey`** (PEM) — signed locally with `jose`. The usual
    path; requires a service-account **key**, created via
    `gcloud iam service-accounts keys create key.json --iam-account=<clientEmail>`
    (or the Console: IAM & Admin → Service Accounts → Keys → Add key).
  - **`appCheck.oauthClientId` / `oauthClientSecret` / `oauthRefreshToken`**
    — signed remotely via IAM Credentials `signJwt`
    (`sign_custom_token_remote.ts`). Use this when your GCP org enforces
    `iam.disableServiceAccountKeyCreation` (Google's "Secure by Default"
    setting on newer projects/orgs) and `keys create` is blocked outright —
    `signJwt` doesn't create or export a key, so the constraint doesn't apply
    to it. Get the three values by running:
    ```sh
    gcloud auth application-default login
    cat ~/.config/gcloud/application_default_credentials.json
    # -> client_id, client_secret, refresh_token
    ```
    then grant that identity permission to sign as the service account
    (no key involved — just delegated signing):
    ```sh
    gcloud iam service-accounts add-iam-policy-binding <clientEmail> \
      --member="user:you@example.com" --role="roles/iam.serviceAccountTokenCreator"
    ```
    `oauthClientId`/`oauthClientSecret` are `application_default_credentials.json`'s
    `client_id`/`client_secret` fields — safe to hardcode `oauthClientId` (it's
    Google's public gcloud CLI OAuth client, not a secret); treat
    `oauthRefreshToken` as sensitive as `privateKey`.
- `middleware/update_session.ts` — refreshes the session cookie and drives
  the guest/auth-page/unverified-email redirects (`redirectAuthPath` /
  `homePath` / `verifyEmailPath`, the last checked via the session token's
  `email_verified` claim, skipped when unset). That claim is only as fresh
  as the last ID-token mint (up to ~1hr stale); a client-written
  `emailVerifiedHintCookieName` cookie (default `__fa_email_verified_hint__`,
  set by `AuthUserProvider` on every auth-state change) lets the middleware
  detect when the claim is likely stale and force one refresh before
  trusting it, without paying a refresh on every request for a genuinely
  unverified user. That confirmation refresh deliberately skips the
  refresh-token cache and only trusts an `email_verified: false` claim when
  the mint actually produced a NEW token — a cached refresh hands back the
  same token whose claim is in question and confirms nothing. Redirecting to
  `verifyEmailPath` on such an unconfirmed claim caused an infinite loop:
  that page resolves the same user as verified via `getAuthUser()`
  (`initializeServerApp` reads live Auth-service state, not the frozen JWT
  claim) and redirects straight back home. A hint that already observed
  verification live likewise wins over the claim. Called automatically by
  `../config/middleware.ts`'s default handler, not meant to be invoked
  directly by consumers.

  Also forwards emailed Firebase action links: Firebase Console exposes only
  ONE project-wide action URL, so every template (reset/verify/recover)
  lands there distinguished only by `?mode=`. This runs BEFORE the guest
  redirect above — a signed-out user following the link must not get bounced
  to `redirectAuthPath` and lose their `oobCode` — and forwards to `resetPasswordPath` / `verifyEmailPath` / `recoverEmailPath` /
  `actionModePaths` for the matching mode (or a specific path in `continueUrl`
  when present, falling back to `actionLinkPath` (if set) or the mode target if `continueUrl` points to `/`),
  preserving the full query string.
  `actionLinkPath`, if set, restricts this to one exact static path (a
  Console action URL pinned to a path, e.g. `/auth/action`, instead of the
  bare domain root); `actionLinkRedirectEnabled: false` turns it off.
- `is_whitelisted.ts` — path-segment prefix matching helper for `whiteListPaths` (e.g. `/bonds` covers `/bonds/some-slug`).
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
