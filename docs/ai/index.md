# AI Docs Index — cloudflare-next-intl

Lazy-loaded reference for working in this repo. Read the index, then open only
the topic file for the area you're touching — don't load all of these at once.

- **Touching `package/src/config/**` or `package/src/general/**`** (locale
  routing, middleware, translation resolution, sitemap/metadata) →
  [`docs/ai/config-and-general.md`](config-and-general.md)
- **Touching `package/src/server/**`** (server components, `getLocale`/
  `getTranslations`, RSC `use()` hooks) →
  [`docs/ai/server.md`](server.md)
- **Touching `package/src/client/**`** (client hooks, cookie helpers,
  `LocaleLink`) → [`docs/ai/client.md`](client.md)
- **Touching `package/src/theme_switcher/**`** →
  [`docs/ai/theme-switcher.md`](theme-switcher.md)
- **Writing or reviewing tests under `package/src/**`** (vitest config,
  coverage thresholds, known dead-code exclusions) →
  [`docs/ai/testing.md`](testing.md)
- **Understanding the package's public API surface / subpath exports** →
  [`docs/ai/package-exports.md`](package-exports.md)

## Repo shape (always relevant)

- `package/` — the actual npm package (`cloudflare-next-intl`), published from
  `package/dist` (built via `tsc`, see `package/package.json`'s `build` script).
- `example/` — a Next.js app that consumes the package locally, useful for
  manually exercising behavior; not covered by the test-coverage work.
- The package has **no runtime dependency on Next.js's `next-intl`** — it's a
  from-scratch, Cloudflare-Workers-friendly reimplementation (small bundle,
  no heavy i18n framework).
