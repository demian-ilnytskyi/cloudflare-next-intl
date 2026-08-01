# Phase 1: 100% Test Coverage for `package/` — Design

## Context

`cloudflare-next-intl` (`package/`) has no test infrastructure today — `"test"` script is a stub, `vitest` is an unused devDependency, zero test files exist across ~30 source files (~1630 lines).

This is Phase 1 of a 3-phase project:
1. **This spec** — 100% test coverage for the existing package.
2. Add an optional `firebase_auth` submodule (isolated, tree-shakeable, no Firebase dependency for non-auth consumers).
3. 100% test coverage for `firebase_auth`, plus a test/build performance optimization pass (fast execution, SSR/caching-aware where relevant).

Phases 2 and 3 are separate specs, written after this phase ships.

## Goals

- Every file under `package/src/**` (excluding barrel `index.ts` re-exports and pure `.d.ts` type files) reaches 100% line/branch coverage.
- No production code behavior changes — this is a tests-only phase. If a genuine bug is found while testing, it is flagged to the user, not silently fixed.
- Coverage enforced in CI going forward (build fails below 100%).

## Tooling

- Add devDependencies: `@vitest/coverage-v8`, `@testing-library/react`, `jsdom`. (`vitest` itself is already present.)
- `package/vitest.config.ts`:
  - `environment: 'jsdom'` (several files are React server/client components).
  - Path aliases mirroring `tsconfig.json`: `@intl-config` → `./src/types/intl_config`, `@locale-file` → `./src/types/locale_file`.
  - `coverage`: `provider: 'v8'`, `reporter: ['text', 'lcov']`, `thresholds: { 100: true }`, `include: ['src/**']`, `exclude: ['src/**/index.ts', 'src/**/*.d.ts']`.
- `package/package.json` `"test"` script → `"vitest run --coverage"`.

## Test layout

Tests are colocated as `*.test.ts` / `*.test.tsx` next to their source file, mirroring the source tree — matches the convention used in the sibling `flutter_basic_dropdown_button` package (tests shadow `lib/` structure).

## Scope by file

### Pure logic (no JSX, no jsdom needed)
- `src/general/general_functions.ts` — `getTranslationsImpl`: nested namespace traversal (single/multi-level), all fallback branches (namespace not object, invalid intermediate structure, namespace not found), key traversal (string encountered prematurely, missing key, invalid intermediate value), cache write side effect.
- `src/general/cache_variables.ts` — cache get/set behavior.
- `src/general/get_layout_states.ts`
- `src/general/metadata.ts`
- `src/config/middleware.ts` (`intlMiddleware`) — locale-cookie hit path, bot detection path (SEO bot vs not), accept-language detection, URL-locale-present vs absent, default-locale rewrite vs non-default redirect, `middlewareHandler` invocation (present/absent, `runHandlerOnRedirect` true/false, handler returns response vs `null`), cookie-set branch (locale changed vs unchanged, bot cookie), error path (catch block).
- `src/config/intl_sitemap.ts`
- `src/config/init_config.ts`
- `src/config/cookie_key.ts`
- `src/config/intl_config.ts`
- `src/server/functions/get_user_locale.ts` — `languageDetecotr` matching/fallback branches.
- `src/server/functions/server.ts`
- `src/server/functions/use_functions.ts`
- `src/server/functions/locale_static_params.tsx` (logic portion; no render needed if it returns data, not JSX)
- `src/client/functions/get_cookie.ts`
- `src/client/functions/set_cookie.ts`
- `src/client/hooks/client_hooks.ts`
- `src/client/hooks/use_path_name.ts`

### React components (React Testing Library + jsdom)
- `src/client/components/client_provider.tsx`
- `src/client/components/client_helper_script.tsx`
- `src/client/components/locale_link.tsx`
- `src/client/components/locale_link_client.tsx`
- `src/server/components/server_provider.tsx`
- `src/server/components/helper_script.tsx`
- `src/server/components/link.tsx`
- `src/theme_switcher/components/theme_switcher.tsx`
- `src/theme_switcher/components/theme_switcher_button.tsx`
- `src/theme_switcher/components/icons.tsx`

### Excluded from coverage
- All barrel `src/**/index.ts` files (pure re-exports, no logic).
- `src/types/types.ts`, `src/types/intl_config.d.ts`, `src/types/locale_file.d.ts` — type-only, no runtime. Correctness enforced by `tsc`, not vitest.

## Mocking strategy

- `next/server` (`NextResponse`, `NextRequest`) — construct real instances where practical (they're plain classes), mock only what requires the Next.js runtime.
- `next/headers` (`cookies()`) — mocked per test with controllable cookie store.
- `next/navigation` — mocked for client hooks (`usePathname` etc.).
- `react`'s `cache()` — either used as-is (it degrades to plain memoization outside a request scope) or mocked if it causes cross-test leakage.
- No real network calls, no real Next.js app instantiation.

## CI

- New (or extended) GitHub Actions workflow running `npm test` inside `package/`, uploading coverage artifact, failing the job on any threshold miss.
- Mirrors the dedicated coverage-generation job pattern from `flutter_basic_dropdown_button/.github/workflows/generate_code_coverate.yaml`.

## Out of scope

- `example/` app — untested, not part of this phase.
- `firebase_auth` — Phase 2/3.
- Any production code changes, refactors, or new features.
- Pushing/committing is explicitly deferred — work stays local until the user reviews and pushes themselves.
