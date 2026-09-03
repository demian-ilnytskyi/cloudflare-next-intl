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
- [packages/firebase-auth.md](packages/firebase-auth.md) — optional
  `firebase_auth` submodule: enabling it, isolation rules, localization,
  middleware wiring.

## After every change to `package/src/**`

Do this before considering any package edit done, in order:

1. **Tests + coverage**: `cd package && npm test` (= `vitest run
   --coverage`) — the full run, not a filtered subset (see
   [packages/testing.md](packages/testing.md) for why a subset run's
   coverage numbers can't be trusted, and for the `rtk` CLI wrapper
   gotcha that can hide the coverage table/console-spy output entirely;
   redirect to a file and grep it if the direct output looks off).
   - Fix any real gap by writing a test that reaches the branch — don't
     reach for a threshold exception until you've traced the code and
     confirmed the branch is genuinely unreachable (see
     [packages/testing.md](packages/testing.md)'s worked example).
   - Zero `ERROR: Coverage for ...` lines and the `Test Files`/`Tests`
     summary showing 0 failed is the only acceptable end state.
2. **Changelog**: add an entry to `package/CHANGELOG.md` (Keep a Changelog
   format, newest on top) describing the change from a consumer's
   perspective — not the root `CHANGELOG.md` (a stale duplicate that
   predates the package's own changelog; don't maintain it further, flag it
   to a human if it needs deleting).
3. **Version bump**: bump `"version"` in `package/package.json` — patch for
   fixes/internal changes, minor for new options/exports, per semver. Do
   this in the same edit as the changelog entry so they never drift apart.
   Multiple small related changes landing in one sitting can share one
   version bump and one changelog entry — don't bump per individual file
   edit if the user is clearly iterating on one piece of work; do bump
   separately once that unit of work is done and a new, unrelated one
   starts.
4. **Docs**: update `package/README.md` and/or `package/llms.txt` when the
   change adds/renames/removes a public export, option, or config field —
   these are both shipped in the tarball (see `package/package.json`'s
   `files`) and are a consumer's first read.
5. **`dist/` check**: `package/dist` is committed to git (not gitignored).
   Don't run `npm run build` speculatively after every source edit — but if
   you do (or a build step ran as a side effect of something else), run
   `git status` after and either commit the resulting `dist/` diff
   deliberately or discard it; never leave an untracked source/`dist` drift
   in the working tree.

## Preparing a publish (maintainer-run, never scripted by an agent)

An agent should get the package to a publish-ready state (steps 1-5 above,
clean `git status`, all committed) and then stop — the actual `npm publish`
requires 2FA and is run manually from the terminal by a human. To help
verify readiness without publishing:

- `npm run build` (`tsc` + `scripts/write_dist_type.mjs`) — must succeed
  with no type errors.
- `npm run check:exports` — verifies every `package.json` subpath export
  actually resolves to something `dist/` contains.
- `npm run check:size` — enforces the banned-heavy-dependency list and that
  `README.md`/`llms.txt` remain in `files` (see
  [packages/package-authoring.md](packages/package-authoring.md)).
- `npm run prepublishOnly` runs all three of the above together — this is
  also what `npm publish` runs automatically, so a clean
  `prepublishOnly` run is the strongest local signal that a real publish
  will succeed.
- Confirm `package/package.json`'s `version` was actually bumped from what's
  currently on npm (`npm view cloudflare-next-intl version`) — publishing
  the same version twice fails outright.
- Confirm `package/CHANGELOG.md` has an entry for the version being
  published, and that `git status` is clean (nothing uncommitted, including
  any `dist/` diff from the build above).

The maintainer then runs `npm version patch` (if not already bumped by hand)
and `npm publish --access public` themselves.

## Repo shape (always relevant)

- `package/` — the published npm package (`cloudflare-next-intl`), built via
  `tsc` (see `package/package.json`'s `build` script) into `package/dist`,
  which is **committed to git** (not gitignored) — see the "`dist/` check"
  step above.
- `example/` — a Next.js app that consumes the package locally for manual
  testing; not covered by automated test/coverage work.
- No runtime dependency on `next-intl` — this is a from-scratch,
  Cloudflare-Workers-friendly reimplementation (small bundle, no heavy i18n
  framework).
