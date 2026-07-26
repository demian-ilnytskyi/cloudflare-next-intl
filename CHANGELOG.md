# Changelog

## 0.2.1

### Changed (breaking)
- `middlewareHandler` signature is now
  `(locale, rewriteUrl, redirectUrl) => NextResponse | null`, replacing
  `0.2.0`'s `(request, locale, targetUrl)`. At most one of `rewriteUrl` /
  `redirectUrl` is ever set, so the handler no longer needs a boolean to
  tell rewrite from redirect:
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
- `MiddlewareCustomHandler` docs no longer claim the handler runs *before*
  the library builds its response (it runs after), and now state clearly
  which `NextResponse` call each parameter corresponds to.

## 0.2.0

### Added
- `intlMiddleware(request, options)` now accepts an `options.middlewareHandler`
  callback to run your own logic (auth, feature flags, etc.) alongside
  locale routing, and `options.runHandlerOnRedirect` to opt it into also
  running on locale redirects (default `false`).
- JSDoc added across all public exports (components, hooks, functions,
  types) for better editor autocomplete and AI-assistant usage.
- README: added a full "Setup" section documenting the required
  `@intl-config` alias wiring in `next.config` and middleware setup, plus
  usage examples for previously-undocumented exports.

### Notes
- `./getLayoutStates` export currently has no runtime implementation
  (disabled in source) — flagged in code, not fixed in this release.
