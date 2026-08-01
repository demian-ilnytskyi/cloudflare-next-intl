# Packages — entry

Rules for building/maintaining `cloudflare-next-intl` (the npm package under
`package/`) and any future sibling package in this repo. Topic files live
under [`packages/`](packages/).

## Per-topic files

- [packages/nextjs.md](packages/nextjs.md) — Next.js App Router, middleware,
  i18n conventions this package implements.
- [packages/package-authoring.md](packages/package-authoring.md) —
  `package.json` exports, tree-shaking, optional submodules, publishing.
- [packages/structure.md](packages/structure.md) — this package's actual
  folder layout, module boundaries, what lives where.
- [packages/config-and-routing.md](packages/config-and-routing.md) —
  `@intl-config`/`@locale-file` aliases, `intlMiddleware`, translation
  resolution (`getTranslationsImpl`), sitemap/metadata.
- [packages/server-client-split.md](packages/server-client-split.md) —
  server vs. client implementations of `useLocale`/`useTranslations`,
  `LocaleContext`, cookie flows, `Link` vs `LocaleLink`.
- [packages/testing.md](packages/testing.md) — vitest setup, 100% coverage
  policy, mocking conventions, known dead-code exceptions.

## Repo shape (always relevant)

- `package/` — the published npm package (`cloudflare-next-intl`), built via
  `tsc` (see `package/package.json`'s `build` script) into `package/dist`,
  which is **committed to git** (not gitignored) — check `git status` after
  any local build for stray `dist/` diffs before committing.
- `example/` — a Next.js app that consumes the package locally for manual
  testing; not covered by automated test/coverage work.
- No runtime dependency on `next-intl` — this is a from-scratch,
  Cloudflare-Workers-friendly reimplementation (small bundle, no heavy i18n
  framework).
- Maintainer publish flow: bump version in `package/package.json`
  (`npm version patch`), `npm run build`, `npm publish --access public`
  (2FA required, run manually from the terminal — never scripted).
