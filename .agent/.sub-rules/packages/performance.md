# Performance Testing & SSR/Cache Conventions

Sibling file: [testing.md](testing.md) covers coverage/correctness tests;
this file covers `*.bench.ts` and `*.perf.test.ts` files under
`package/src/**`.

## Two kinds of performance file, kept separate

- **`*.bench.ts`** — vitest `bench()` blocks. Informational only, run via
  `npm run bench` (separate from `npm test`), reported by the non-blocking
  `bench` job in `demian-ilnytskyi/workflows`'
  `.github/workflows/package_ci_build_and_test.yml` (opted into via
  `run_bench: true` in `.github/workflows/package-test-coverage.yaml`).
  Never asserts pass/fail on timing — CI runner variance makes timing
  thresholds flaky by nature.
  Excluded from `npm test`'s coverage run via `vitest.config.ts`'s
  `coverage.exclude`.
- **`*.perf.test.ts`** — plain vitest assertions using `vi.spyOn`/mock
  call-counts or cache-identity checks, NOT timing. These are correctness
  tests about caching behavior ("was the expensive path actually skipped on
  the second call?") and are part of the regular, coverage-gated `npm test`
  run.

## Why call-count assertions, not timing assertions

Timing-based assertions in CI are flaky (shared runners, variable load).
Call-count assertions on a spied dependency (e.g. `initializeApp` called
exactly once across three `getAuthenticatedAppForUser()` calls) test the
exact same underlying claim — "redundant work was avoided" — deterministically.

## What's benchmarked/checked today

- `getTranslationsImpl` (`src/general/general_functions.ts`) — namespace/key
  traversal cost, cached vs. uncached cacheKey, measured only via
  `general_functions.bench.ts` (informational). No `.perf.test.ts` exists for
  this function: it always recomputes the translator function on every call
  (`translationFunctionsCache`/`setTranslationCache` are consulted by
  callers upstream, not by `getTranslationsImpl` itself), so there is no
  internal cache-hit path to assert here without asserting on plain `Map`
  reference semantics instead of package behavior.
- `intlMiddleware` (`src/config/middleware.ts`) — warm (locale cookie
  present) vs. cold (bot-detection + accept-language parsing) request cost,
  measured via `middleware.bench.ts`. React's `cache()` (wrapping the
  bot-detection check) only memoizes within a request's async context
  (backed by `AsyncLocalStorage` in real Next.js) — outside that context, as
  verified directly, it recomputes on every call. The `.perf.test.ts`
  therefore checks the observable outcome: repeated requests with the same
  user-agent and accept-language resolve to the same `Content-Language`
  response header, not a call-count on the underlying `isBot()` check.
- `getAuthenticatedAppForUser` (`src/firebase_auth/server/firebase_server.ts`)
  — memoized via a module-scope `baseApp` variable (not `cache()` itself,
  which only wraps the outer function for per-request dedup); the perf test
  asserts `initializeApp` is called exactly once across three calls within
  the same module scope. This is the one perf test with a genuine
  call-count guarantee (verified by mutation testing: removing the
  memoization makes the test fail).

## Adding a new bench/perf test

1. Identify the hot path — something called per-request or per-render, with
   an existing cache/memoization mechanism whose effectiveness hasn't been
   measured.
2. Add a `<name>.bench.ts` next to the source file for the informational
   ops/sec measurement.
3. If the hot path has a cache, add a `<name>.perf.test.ts` asserting the
   cache is actually consulted — spy on the underlying expensive call
   (network request, object construction, module-scope state) and assert
   its call count or referential identity stays flat across repeated
   invocations with the same inputs.
4. Before asserting on React's `cache()` specifically, verify it actually
   memoizes in a plain vitest module scope (it does not, outside a request's
   async context) — assert on the real underlying memoization mechanism
   instead (a module-scope variable, a `Map`, etc.) where one exists.
5. `.bench.ts` files are excluded from `npm test`'s coverage run via
   `vitest.config.ts`'s `coverage.exclude`. `.perf.test.ts` files DO count
   toward coverage and are NOT excluded.
