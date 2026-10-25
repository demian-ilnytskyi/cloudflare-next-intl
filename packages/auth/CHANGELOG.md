# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.2] - 2026-10-25

### Added

- `firebaseAuth.appCheck.preloadTurnstile`: Preloads the Turnstile script and widget as soon as App Check initializes (defaults to `true`), eliminating challenge startup delays. Set to `false` for lazy loading upon first challenge request.

### Fixed

- Turnstile widget configured with `retry: 'never'` to prevent 30-second automated background retry loops on network errors or challenge failures, immediately triggering fallback.
- Prevent premature `turnstile.reset()` before token is exchanged on the server.

## [0.3.1] - 2026-10-25

### Fixed

- Auth actions (`createLoginAction`, `createSignUpAction`, `createForgotPasswordAction`, `createSendSignInLinkAction`, `completeSignInWithLink`) and `AuthUserProvider` (session restore via `signInWithCustomToken`, `reloadUser`, `sendVerificationEmail`) now await `getAppCheckToken()` before calling Firebase. Firebase Auth starts its 30 s network timeout before it requests the App Check token, so an interactive Turnstile challenge that took longer failed with `auth/network-request-failed` ("Network error") and the request was never sent.
- With both `turnstileSiteKey` and `recaptchaV3SiteKey` set, a failed Turnstile challenge (for example Cloudflare rejecting an automated browser with `600010`) falls back to reCAPTCHA v3 once. Set `appCheck.recaptchaFallback: false` to use Turnstile only.
- A failed Turnstile challenge is rethrown to `getToken` calls made within `TURNSTILE_FAILURE_REUSE_MS` (3 s), so the Firebase request that follows a failed `getAppCheckToken()` fails fast instead of showing the visitor a second challenge.

## [0.3.0] - 2026-10-25

### Added

- `firebaseAuth.appCheck.customTokenTtlSeconds`: lifetime of server-minted App Check tokens, sent as the custom token `ttl`. Must be an integer between 1800 and 604800; `normalizeFirebaseAuthConfig` throws otherwise.

### Changed

- `firebaseAuth.appCheck.isTokenAutoRefreshEnabled` now defaults to `false`. Tokens are fetched on demand only, so no challenge runs on page load or in a background tab. Set `true` to restore eager fetch and refresh.

### Fixed

- The idle Turnstile container is no longer `display: none`. It stays rendered, transparent and fixed to a corner, so Managed mode can pass visitors invisibly instead of falling back to the interactive checkbox.
- `AuthUserProvider` no longer defers the auth subscription on a whitelisted page when a server session marker cookie is present, so a signed-in visitor stays in the loading state instead of briefly showing as signed out.

## [0.1.0] - 2026-10-24

### Added

- Initial release of `cloudflare-next-intl-auth` extracted from `cloudflare-next-intl`.
