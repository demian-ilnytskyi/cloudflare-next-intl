# Changelog

## 0.9.7

### Fixed

- All internal `next/*` imports are now fully specified (`next/image.js`, `next/dynamic.js`, `next/headers.js`, `next/navigation.js`, `next/server.js`, `next/link.js`). This package is `"type": "module"` while Next.js publishes no `exports` map, so Node's ESM resolver refused to guess the `.js` extension for an extensionless bare subpath. Consumers whose test runner resolved this package as an external ESM dependency (e.g. Vitest without inlining) failed with `Cannot find module '.../node_modules/next/image' ... Did you mean to import "next/image.js"?`. Next's bundler explicitly aliases the fully specified form, so app builds are unaffected.

### Note for consumers

`@intl-config` remains a bundler-only virtual alias and cannot be resolved by Node for an externalized dependency. If your test runner resolves `cloudflare-next-intl` as external, inline it so your alias applies:

```ts
// vitest.config.ts
export default defineConfig({
    resolve: { alias: { '@intl-config': path.resolve(__dirname, 'src/i18n/intl_config') } },
    test: {
        server: { deps: { inline: ['cloudflare-next-intl'] } },
    },
});
```

## 0.8.59

### Fixed

- `next_image_shim` no longer statically imports the `virtual:cloudflare-next-intl-images-manifest` module, which only the Vite/build plugin resolves. Consumers running Vitest/Jest without the plugin loaded (e.g. testing components that render `<Image>`) previously failed with `Cannot find package 'virtual:cloudflare-next-intl-images-manifest'`. The manifest is now loaded via a dynamic `import()` guarded by `try/catch`, falling back to an empty manifest when unresolved.

## 0.8.57

### Added

- Codebase usage scanner (`scan_used.ts` / `collectUsedImages`): automatically scans application source code (`.tsx`, `.ts`, `.jsx`, `.js`, `.vue`, `.svelte`, `.mdx`, `.html`) for image references and only optimizes images actually used in `<Image>` components, skipping unused assets.
- Automatic WebP primary source URL: `entry.src` now points directly to the optimized `.webp` file (`/generated/.../image.webp`), saving 80-90% bandwidth automatically with zero client config changes.
- CLI support for `--all` flag to force scanning all files in configured image directories.

## 0.8.56

### Fixed

- Browser-safe SVG blur placeholder generation in `getImageBlurSvg` using `btoa` fallback when `Buffer` is undefined in browser/client components.
- Resilient image manifest lookup in `next_image_shim` supporting object `src` (`StaticImageData`), leading slash variations, query strings, and stripped `public/` prefixes.
- Injected inline `backgroundImage: url(blurDataURL)` style fallback to guarantee blur placeholder display across all runtimes.

## 0.8.55

### Added

- CLI bin commands `cfni-image-optimizer` and `optimize-images` for manual or build-pipeline standalone image optimization runs.
- Default `cacheFile` path resolution (`path.resolve(root, options.cacheDir, "manifest.json")`) when omitted in `run()` image optimizer API.

## 0.8.54

### Added

- Built-in Image Optimizer (`cloudflare-next-intl/image-optimizer`, `cloudflare-next-intl/vite`) with Sharp raster processing, `.avif`/`.webp`/`.blur.webp` sibling generation, Next.js SVG Gaussian blur placeholders, transparent `<Image placeholder="blur" />` shimming, and per-image overrides.
- Exported `./image-optimizer` and `./imageOptimizer` package subpaths.
- 100% test coverage across all image optimizer and Vite plugin components.

## 0.8.53

### Added

- `cloudflareNextIntl()` all-in-one Vite plugin (`cloudflare-next-intl/vite`) consolidating `localeFilePlugin`, `userAgentStubPlugin`, `cfWorkersClientStubPlugin`, and `buildIdAsset`.
- Full support for Vinext Cloudflare Workers builds with zero `node:fs` runtime crashes.
- `showPrivacyPolicy?: boolean` option (defaults to `true`) in `cookieConsent` config and dialog components (`CookieConsentDialog`, `PrivacyPolicyUpdateDialog`).
- Forwarded Cloudflare country (`x-cf-country`), timezone (`x-cf-timezone`), pathname, and search request headers in `intlMiddleware` to downstream Server Components.
- Supported `generate.ctx` in `getCountry()` and `getTimezone()` so visitors from non-GDPR regions (like Ukraine `UA`) skip cookie consent gating.

## 0.8.43

### Added

- `isStaleDeployError(error, patterns?)`, `setStaleDeployPatterns(patterns)`, `getStaleDeployPatterns()`, `defaultStaleDeployPatterns`, and `clearClientCache()` exported from `cloudflare-next-intl/errorHandling`, `cloudflare-next-intl/isStaleDeployError`, and `cloudflare-next-intl/clearClientCache` for stale deploy / chunk load error detection and client cache recovery.
- Added `errorHandling.staleDeployPatterns` configuration option in `setIntlConfig`.

## 0.8.42

### Added

- `buildIdAsset(fileName?)` plugin exported from `cloudflare-next-intl/vite` to emit client `BUILD_ID` assets in Vite / Vinext builds. Added optional `vite` peer dependency (`>=6`).

## 0.8.41

### Added

- Configurable request header names for Geo & Timezone resolution via `generate.countryHeaderNames` and `generate.timezoneHeaderNames` (or per-call `headerNames` argument to `getCountry()` and `getTimezone()`).
- Configurable country headers via `cookieConsent.countryHeaderNames` and automatic request-header fallback in `resolveRequiresConsent`.

## 0.8.40

### Changed

- Decoupled `getCountry` and `getTimezone` helpers from global config singleton, allowing explicit `generate` parameter.
- Flexible typing for `GenerateRoutingConfig.env`.

## 0.8.39

### Added

- First-class Vinext and Cloudflare Workers runtime support with `generate.env` and `generate.ctx`.
- `getCountry(input?)` and `getTimezone(input?, fallback?)` helpers exported from `cloudflare-next-intl/server`, `cloudflare-next-intl/geo`, and root `cloudflare-next-intl`.
- Automatic `x-cf-country` and `x-cf-timezone` header propagation in `intlMiddleware`.

## 0.8.38

### Fixed

- Prevent router prefetch redirect loops in `firebaseAuthMiddleware` (`update_session`). Prefetch requests (`next-router-prefetch: 1`, `purpose: prefetch`, or `x-purpose: prefetch`) on routes that would redirect (e.g. unauthenticated guest on protected route, signed-in user on auth page, unverified email) now return an empty `204 No Content` with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` instead of a 307/308 redirect, preventing Next.js segment cache from filing redirected responses under requested URLs and hammering the origin. Real navigation requests are unaffected and execute full redirect logic.

## 0.8.37

### Fixed

- Prevent infinite router refresh loop on whitelisted non-auth paths (`whiteListPaths`) for signed-out users in `AuthUserProvider`.

## 0.8.36

### Added

- `useExplicitRecaptchaScript` option on `FirebaseAppCheckConfig` (defaults to `true` when `recaptchaV3SiteKey` is set). When active, App Check uses a custom reCAPTCHA provider with explicit widget rendering and token exchange against `exchangeRecaptchaV3Token` to prevent private-window/cross-CDN integrity freezes.
- `IntlHelperScript` automatically injects the explicit reCAPTCHA script tag (`https://www.google.com/recaptcha/api.js?render=explicit`) when `recaptchaV3SiteKey` is configured and `useExplicitRecaptchaScript !== false`.
- `getAppCheckToken()` now enforces a 10s timeout and catches errors cleanly, continuing without App Check token on failure.
- `getFirebaseAuthClient()` wraps App Check initialization in a try/catch block to avoid crashing client initialization if App Check fails.

## 0.8.35

### Fixed

- The emailed-action-link forward no longer strips `mode`/`apiKey` for `mode=signIn`. `signInWithEmailLink` re-parses the landed URL and rejects it without those params, so every sign-in link failed with `auth/invalid-action-code` immediately — surfacing as "link expired/invalid" regardless of the link's actual age. `resetPassword`/`verifyEmail` forwards are unaffected and still strip the full query by default.

## 0.8.33

### Fixed

- `refreshIdToken` in the `update_session` middleware now requests with `cache: 'no-store'`, preventing OpenNext/Cloudflare from caching a stale token-refresh response.
- Auth redirect responses built by `buildRedirect` now set `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, preventing OpenNext/Cloudflare from caching these redirects.

## 0.8.32

### Fixed

- `update_session` middleware no longer follows `continueUrl` away from an emailed action link's mode target once the request is already on that page, which previously caused a `/verify-email` ↔ `/auth/action` redirect loop.

### Added

- Same-origin emailed-action-link forwards now strip Firebase's own `mode`/`apiKey`/`lang`/`continueUrl` query params, landing on a clean `?oobCode=` URL. New `stripActionLinkQuery` option (default `true`) restores the full query when set to `false`. Cross-origin redirects always keep the full query.

## 0.7.7

### Fixed

- `logout()` in `AuthUserProvider` skips redirecting to `redirectAuthPath` when called on a whitelisted path (`whiteListPaths`), allowing pages like account deletion to finish rendering after signing out.

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
