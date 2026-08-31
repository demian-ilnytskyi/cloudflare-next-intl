# cloudflare-next-intl

<p align="center">
  <a href="https://www.npmjs.com/package/cloudflare-next-intl"><img src="https://img.shields.io/npm/v/cloudflare-next-intl" alt="npm"></a>
  <a href="https://app.codecov.io/github/demian-ilnytskyi/cloudflare-next-intl"><img src="https://img.shields.io/codecov/c/github/demian-ilnytskyi/cloudflare-next-intl" alt="coverage"></a>
  <a href="https://github.com/demian-ilnytskyi/cloudflare-next-intl/actions/workflows/package-push-code-coverage.yaml"><img src="https://img.shields.io/github/actions/workflow/status/demian-ilnytskyi/cloudflare-next-intl/package-push-code-coverage.yaml?event=push&branch=main&label=tests&logo=github" alt="tests"></a>
  <a href="https://github.com/demian-ilnytskyi/cloudflare-next-intl/actions/workflows/package-test-coverage.yaml"><img src="https://img.shields.io/github/actions/workflow/status/demian-ilnytskyi/cloudflare-next-intl/package-test-coverage.yaml?event=pull_request&label=Code%20Analysis%20%26%20Formatting&logo=github" alt="Code Analysis & Formatting"></a>
  <a href="https://www.npmjs.com/package/cloudflare-next-intl"><img src="https://img.shields.io/npm/l/cloudflare-next-intl" alt="license"></a>
</p>

A lightweight, from-scratch internationalization (i18n) library for Next.js App Router, built to run cleanly on Cloudflare Workers. No dependency on `next-intl` or any heavy i18n framework — small bundle, tree-shakeable subpath exports, and full control over locale routing via a single middleware.

---

## Why

Most Next.js i18n libraries assume a Node.js runtime and pull in a large dependency tree. `cloudflare-next-intl` is built specifically to work within Cloudflare Workers' constraints — minimal bundle size, no heavy runtime dependencies, and every feature available as its own subpath import so unused code is never bundled.

---

## Features

- **Single middleware** — locale-cookie detection, `Accept-Language` parsing, bot detection, and default-locale rewrite/redirect handled in one `intlMiddleware`, with an optional `middlewareHandler` extension point for your own logic.
- **Server & client APIs** — `getTranslations`/`getLocale` for Server Components, hooks for Client Components, all sharing the same translation resolution logic.
- **Tree-shakeable subpath exports** — import only what you use (`/client`, `/server`, `/geo`, `/middleware`, `/LocaleLink`, `/ThemeSwitcher`, etc.) instead of one large barrel.
- **Built-in Geo & Timezone resolution** — `getCountry()` and `getTimezone()` helpers with automatic header propagation in `intlMiddleware`. Header names default to `x-cf-country`/`cf-ipcountry` and `x-cf-timezone`/`cf-timezone`, and are overridable via `generate.countryHeaderNames` / `generate.timezoneHeaderNames` (or a per-call `headerNames` argument).
- **First-class Vinext & OpenNext support** — direct binding support (`generate.env`, `generate.ctx`) for Cloudflare Workers.
- **Theme switcher included** — an optional, isolated `ThemeSwitcher` component that doesn't affect bundle size if unused.
- **Cloudflare-first** — no Node-only APIs, works with the Edge/Workers runtime.
- **Error handling & Stale Deploy recovery** — opt-in error reporting (`reportError`, `withErrorHandling`), `isStaleDeployError()` for detecting stale chunk/RSC load errors after new deployments, and `clearClientCache()` for resetting client caches and service workers.
- **Built-in Image Optimizer** — automatic downscaling, `.avif`/`.webp` generation, 8px blur thumbnail generation with Next.js-matching SVG Gaussian blur placeholder support, and `<Image placeholder="blur" />` transparent shimming for Vinext/Cloudflare.
- **Database**: optional Postgres/Drizzle data-access layer, reachable either directly (e.g. via Cloudflare Hyperdrive) or through the Supabase Data API.
- **100% test coverage** on the package source (`package/src/**`), enforced in CI.

---

## Installation

```bash
npm install cloudflare-next-intl
```

## Quick Start

```ts
// middleware.ts
export { intlMiddleware as middleware } from "cloudflare-next-intl/middleware";

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

```ts
// intl-config.ts
import { setIntlConfig } from "cloudflare-next-intl/setIntlConfig";

export default setIntlConfig({
  locales: ["en", "de"],
  defaultLocale: "en",
});
```

See [`example/`](example) for a full working Next.js app using the package.

---

## Testing Setup (Vitest / Jest)

This package resolves your app's routing config through the bare `@intl-config`
specifier. It is a **virtual alias**, not a real module — your bundler supplies
it. Next.js does this via the alias you configure, but a test runner needs the
same mapping, plus one extra step.

Point the alias at your config file **and inline the package**:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@intl-config": path.resolve(__dirname, "src/i18n/intl_config"),
    },
  },
  test: {
    // Required. Vite's `resolve.alias` does NOT apply to an externalized
    // dependency — Node resolves it directly and rejects `@intl-config` with
    // `Invalid module "@intl-config" is not a valid package name`. Inlining
    // routes the package through Vite so the alias above reaches it.
    server: { deps: { inline: ["cloudflare-next-intl"] } },
  },
});
```

Without `deps.inline`, any test that transitively imports this package fails to
collect. Symptoms:

| Error | Cause |
| --- | --- |
| `Invalid module "@intl-config" is not a valid package name` | Package not inlined, so the alias never applies. |
| `Cannot find module '.../node_modules/next/image'` | Older versions (< 0.9.7) shipped extensionless `next/*` imports. Upgrade. |

If your tests render components, also make sure `react`, `react-dom` and `next`
resolve to a single copy — a linked or duplicated install causes
`Cannot read properties of null (reading 'useContext')`.

---

## Package Exports

| Subpath | Purpose |
| --- | --- |
| `cloudflare-next-intl` | Core exports |
| `cloudflare-next-intl/client` | Client-side utilities |
| `cloudflare-next-intl/server` | Server-side utilities |
| `cloudflare-next-intl/middleware` | `intlMiddleware` |
| `cloudflare-next-intl/setIntlConfig` | Locale config setup |
| `cloudflare-next-intl/serverProvider` | Server-side context provider |
| `cloudflare-next-intl/Link` | Locale-aware server `Link` |
| `cloudflare-next-intl/LocaleLink` | Locale-aware client link |
| `cloudflare-next-intl/IntlHelperScript` | Locale bootstrap script |
| `cloudflare-next-intl/usePathname` | Locale-aware `usePathname` hook |
| `cloudflare-next-intl/metadata` | Locale-aware metadata helpers |
| `cloudflare-next-intl/setCookieClient` / `getCookieClient` | Client cookie helpers |
| `cloudflare-next-intl/localeStaticParams` | `generateStaticParams` helper |
| `cloudflare-next-intl/use` | Universal translation hook (server/client aware) |
| `cloudflare-next-intl/ThemeSwitcher` | Optional theme switcher component |
| `cloudflare-next-intl/geo` | Country & timezone resolution helpers (`getCountry`, `getTimezone`) |
| `cloudflare-next-intl/vite` | All-in-one Vite plugin (`cloudflareNextIntl`) for Vinext & Cloudflare Workers |
| `cloudflare-next-intl/errorHandling` | Error reporting and stale deploy helpers (`reportError`, `withErrorHandling`, `isStaleDeployError`, `clearClientCache`) |
| `cloudflare-next-intl/isStaleDeployError` | Stale deploy / chunk load error detector (`isStaleDeployError`) |
| `cloudflare-next-intl/clearClientCache` | Client cache and service worker cleanup utility (`clearClientCache`) |
| `cloudflare-next-intl/db*` | Optional Postgres / Supabase Drizzle data layer (`db`, `dbHelpers`, `dbSchema`, `dbEslint`, `dbTesting`) |
| `cloudflare-next-intl/firebaseAuth*` | Optional Firebase Authentication integration (client/server providers, hooks, actions, middleware) |
| `cloudflare-next-intl/cookieConsent` | Optional cookie-consent + privacy-policy-update banner, with analytics gating |

Full reference in [`package/llms.txt`](package/llms.txt).

---

## Test Coverage

This package has 100% line/branch test coverage (with two narrowly-scoped, documented exceptions for genuinely unreachable defensive code), enforced via CI on every push and pull request. See [`docs/ai/testing.md`](docs/ai/testing.md) for details.

---

## License

MIT — see [LICENSE](LICENSE).
