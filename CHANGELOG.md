# Changelog

## 0.7.6

### Fixed

- `update_session` middleware prioritizes `actionLinkPath` over mode target path when redirecting cross-origin action links with a `continueUrl` path of `/`.
- `resolveAuthUserAndRedirect` on the server now uses path-segment prefix matching (`isWhitelisted`) for `whiteListPaths` (e.g. `/bonds` covers `/bonds/some-slug`), aligning server-side auth redirects with client-side whitelist rules.

## 0.7.5

### Fixed

- `update_session` middleware redirects cross-origin action links to `actionLinkPath` (e.g. `/auth/action`) on the target origin when `parsed.pathname` is `/`, allowing the target origin's middleware to process the action link mode.

## 0.7.4

### Fixed

- `update_session` middleware now falls back to the mode target path (e.g. `/reset-password`) when an emailed Firebase action link's `continueUrl` points to the home root (`/`).

## 0.7.3

### Fixed

- `update_session` middleware external origin `continueUrl` handling.

## 0.6.34

### Changed

- Minor internal improvements;

## 0.6.33

### Changed

- Added test coverage for `isIdTokenExpired`, `refreshIdToken`'s `skipCache`
  option, and the ON-`verifyEmailPath` forced-refresh invalid-token outcome. No
  behavior change.

## 0.6.32

### Fixed

- A signed-in user could render as signed out on the server
  (`auth/invalid-user-token`) while the client stayed signed in. The
  middleware's refresh cache could serve an ID token past its own expiry;
  `initializeServerApp` reports a rejected token by resolving a null user rather
  than throwing, so nothing retried; and the retry itself could refresh straight
  back into the same cached bad token.
- Server-side auth now retries once with a freshly minted token
  (`refreshIdToken(..., { skipCache: true })`) and writes the new pair back to
  cookies where the context permits it.

### Changed

- Session/refresh cookie attributes come from one shared
  `sessionCookieOptions()` helper used by both the middleware and the
  server-side refresh.

## 0.6.31

### Added

- `FirebaseAuthRoutingConfig.preserveRedirectQuery` (default `true`) carries the
  original request's query string across `firebase_auth` redirects.

## 0.6.30

### Added

- Client-side error reports created via `createServerErrorAction` now attach
  request context (path, user agent, referer) automatically.

### Fixed

- `exchangeCustomToken` now authenticates with the Firebase Web API key and
  aligns token parameters with `firebase-admin` defaults.
- `mintServerAppCheckToken` exchange requests are now authenticated using the
  project API key.

## 0.2.2

### Fixed

- `getTranslations`/`getMessage` no longer serve stale messages in development:
  the module-level `loadedTranslations` cache used to persist for the whole
  `next dev` process, so editing `messages/<locale>.json` never took effect
  without a full server restart. In dev (`NODE_ENV=development`) messages are
  now re-imported on every call; production behavior (cached, one import per
  locale) is unchanged.

## 0.2.1

### Changed (breaking)

- `middlewareHandler` signature is now
  `(locale, rewriteUrl, redirectUrl) => NextResponse | null`, replacing
  `0.2.0`'s `(request, locale, targetUrl)`. At most one of `rewriteUrl` /
  `redirectUrl` is ever set, so the handler no longer needs a boolean to tell
  rewrite from redirect:
  - `rewriteUrl` set → apply `NextResponse.rewrite(rewriteUrl, { request })`
  - `redirectUrl` set → apply `NextResponse.redirect(redirectUrl, request)`
  - both `undefined` → no locale routing needed; your own logic goes here
- The `request` parameter was removed from the handler — close over the
  `request` from your own `middleware(request)` function instead.
- Returning `null` still lets the library apply its own default response.

### Migration

```diff
-middlewareHandler: (request, locale, targetUrl) => {
-    if (targetUrl) return null;
-    return NextResponse.next({ request });
-}
+middlewareHandler: (locale, rewriteUrl, redirectUrl) => {
+    if (rewriteUrl) return NextResponse.rewrite(rewriteUrl, { request });
+    if (redirectUrl) return NextResponse.redirect(redirectUrl, request);
+    return NextResponse.next({ request });
+}
```

### Fixed

- `MiddlewareCustomHandler` docs no longer claim the handler runs _before_ the
  library builds its response (it runs after), and now state clearly which
  `NextResponse` call each parameter corresponds to.

## 0.2.0

### Added

- `intlMiddleware(request, options)` now accepts an `options.middlewareHandler`
  callback to run your own logic (auth, feature flags, etc.) alongside locale
  routing, and `options.runHandlerOnRedirect` to opt it into also running on
  locale redirects (default `false`).
- JSDoc added across all public exports (components, hooks, functions, types)
  for better editor autocomplete and AI-assistant usage.
- README: added a full "Setup" section documenting the required `@intl-config`
  alias wiring in `next.config` and middleware setup, plus usage examples for
  previously-undocumented exports.

### Notes

- `./getLayoutStates` export currently has no runtime implementation (disabled
  in source) — flagged in code, not fixed in this release.
