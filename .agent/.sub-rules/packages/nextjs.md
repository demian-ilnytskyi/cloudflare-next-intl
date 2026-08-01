# Next.js — App Router, Middleware, i18n Packages

Covers Next.js App Router conventions used by `cloudflare-next-intl` and its
consumer apps. Sibling files: [package-authoring.md](package-authoring.md)
(publishing, exports, tree-shaking), [config-and-routing.md](config-and-routing.md)
(this package's actual `intlMiddleware`/translation-resolution implementation).

## App Router structure

- Route groups `(group)` for layout-sharing without affecting the URL path.
  Dynamic segments `[param]`, catch-all `[...param]`, optional catch-all
  `[[...param]]` for locale-prefixed routing (`/[locale]/...` with default
  locale unprefixed).
- Server Components by default. Add `"use client"` only at the leaf that
  needs interactivity/state/browser APIs — push it as far down the tree as
  possible, not at page/layout level.
- `generateMetadata`/`generateStaticParams`/`sitemap.ts` are server-only,
  wrap expensive per-locale computation in React's `cache()` so multiple
  callers in one request share one result.

## Middleware

- One `middleware.ts` per app, `matcher` config excludes `_next`, static
  assets, and API routes unless the middleware genuinely needs to run there.
- Locale routing: resolve locale from (in order) URL segment → cookie →
  `accept-language` header → default. Default locale is served **unprefixed**
  via `NextResponse.rewrite`; any other locale gets a visible
  `NextResponse.redirect` — never redirect for the default locale (causes a
  visible URL flash on every request).
- Bot detection (SEO crawlers) should skip `accept-language` parsing and
  always resolve to the default locale — crawlers must see stable,
  cacheable URLs.
- Wrap the whole middleware body in try/catch; on error fall back to
  `NextResponse.next()` and `console.error` — a broken middleware must never
  hard-fail the request.
- Only set cookies when their value actually changed (`existing !== next`) —
  avoids `Set-Cookie` on every single request.
- Custom app logic (auth, feature flags) composes as an optional callback
  parameter into the shared middleware function, not a second middleware —
  Next.js only runs one `middleware.ts` per request. Contract: at most one
  of `rewriteUrl`/`redirectUrl` is ever set; both undefined means no locale
  routing was needed and the callback's own logic applies.

## Server/client boundary for i18n

- Translation JSON lives outside the package, loaded via a path alias
  (e.g. `@locale-file`) the consumer maps to their own files — never bundle
  consumer translations into the package itself.
- A config file (e.g. `@intl-config`) is the single source of truth for
  `locales`/`defaultLocale`; read it once at module scope, throw synchronously
  at import time if unset (fail fast, not silently fall back to English).
- Namespace-based translation lookup: dot-separated namespace resolves to an
  object, dot-separated key resolves to a string within it. Every traversal
  failure (missing namespace, wrong type mid-path, missing key) logs and
  returns a fallback (the key itself) — never throws at translation-call
  time, only at config-load time.
- Cache translator functions per `(locale, namespace)` at module scope
  (`Map`), since `getTranslations`-equivalent calls happen on every render.

## Cookies & session state (Edge-safe)

- Any cookie/session logic that must run in Edge middleware cannot import
  SDKs with Node-only dependencies (e.g. `firebase/auth`'s `MessageChannel`
  usage breaks Edge bundles) — reimplement the minimal check (e.g. manual
  JWT `exp` decode via `atob`) rather than importing the full SDK.
- Session refresh via a plain REST call (e.g. Google's Secure Token API)
  instead of an SDK method, when the SDK method isn't Edge-compatible.
- Client-side session sync: listen for the auth SDK's token-change event,
  force-refresh the token before writing it to a cookie (an unforced fetch
  can still return a stale cached token from before a reload/verify action).

## React `cache()` de-duplication

- Wrap any per-request expensive lookup (DB call, token validation, external
  API) in React's `cache()` so multiple Server Components in the same render
  tree share one result instead of each re-fetching.
- `cache()` memoizes per request in real Next.js; in tests it memoizes per
  module import — use `vi.resetModules()` + dynamic `import()` between test
  cases that need a fresh, non-memoized call.

## Common pitfalls

- Don't call `redirect()` inside a `try/catch` that doesn't specifically
  rethrow it — Next.js implements redirects by throwing a special error,
  and a catch-all `catch` block will swallow it silently.
- Don't read `headers()`/`cookies()` outside an `async` Server Component or
  Route Handler — both are async APIs in current Next.js and must be awaited.
- Don't put auth/feature-flag redirect logic only in middleware — middleware
  can only cheaply check cookie *presence*, not validity. Do the
  authoritative check (token validation) in the Server Component that owns
  the redirect, before any HTML streams, to avoid a signed-in-then-bounce
  flash.
