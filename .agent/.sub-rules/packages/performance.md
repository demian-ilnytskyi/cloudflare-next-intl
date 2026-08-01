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

## An important caveat about React's `cache()`

React's `cache()` (used throughout this package: `getMessage`, `getLocale`,
`getTranslations`, `languageDetecotr`, `languages`, `alternatesLinks`,
`generateIntlSitemap`, the middleware's bot-detection check) only memoizes
within a request's `AsyncLocalStorage`-backed async context in real Next.js.
Verified directly: outside that context (a plain vitest module scope, sync
or async calls, identical args), it recomputes on every call. This means:

- A `.perf.test.ts` asserting a call-count reduction from `cache()` alone,
  outside a real request, is not just weaker than intended — it is
  measuring nothing and will pass whether or not the caching logic actually
  works. Do not write one.
- Where a function also has its own module-scope memoization *underneath*
  the `cache()` wrapper (a `Map`, a plain variable, an in-flight-promise
  dedupe), assert on that mechanism directly instead — it's real, checkable
  outside a request context, and is what actually matters for repeated
  calls within one request server-side or across calls client-side.
- Functions with ONLY a `cache()` wrapper and no underlying memoization
  (`languageDetecotr`, `languages`, `alternatesLinks`,
  `generateIntlSitemap`) get a `.bench.ts` only — there is no real
  cache-identity claim to assert in tests.

## What's benchmarked/checked today

- `getTranslationsImpl` (`src/general/general_functions.ts`) — namespace/key
  traversal cost, cached vs. uncached cacheKey, measured via
  `general_functions.bench.ts` (informational).
- `getMessage`/`getLocale`/`getTranslations` (`src/server/functions/server.ts`)
  — `general_functions.bench.ts`'s sibling `server.bench.ts` measures cold
  vs. warm cost for all three. `server.perf.test.ts` asserts real
  module-scope caches: `getMessage` returns the same messages-object
  reference across repeat calls per locale (via `loadedTranslations`, a
  plain `Map` in `cache_variables.ts`) and bypasses that cache entirely in
  dev mode (verified via `setMessageForLocaleCache` call count); `getLocale`
  reads the locale cookie at most once per module scope (verified via
  `cookies().get` call count); `getTranslations` returns the identical
  translator function reference on a repeat call for the same
  locale/namespace — this exercises `getTranslationCache()`
  (`cache_variables.ts`), the read half of `translationFunctionsCache` that
  was previously dead code (written via `setTranslationCache` in
  `general_functions.ts` but never read — the read was commented out in
  `iGetTranslations`; wiring it up in `server.ts` turned an unbounded,
  never-consulted `Map` into a real per-namespace/locale cache). The read is
  gated behind the same `isDev` guard as `getMessage`'s cache, so a
  since-edited `messages/*.json` in dev still takes effect on the next
  request rather than serving a stale cached translator.

  **Known limitations of this cache, left as-is (flagged, not fixed):**
  - **Key aliasing:** the cache key is `` `${locale}-${namespace}` ``. A
    hyphenated locale and a namespace containing a literal `-` can collide
    onto the same string as a different (locale, namespace) pair (e.g.
    `locale="en-x", namespace="y"` and `locale="en", namespace="x-y"` both
    produce `"en-x-y"`). This package's own locales are plain codes today,
    so this is latent, not exploitable in this codebase's current config —
    but it is a real design flaw in the key format, not defended against.
  - **Process-global and unbounded:** `translationFunctionsCache` (like
    `loadedTranslations`) is a module-scope `Map` with no eviction — it
    grows for the life of the server process, one entry per distinct
    (locale, namespace) pair ever requested.
  - **Shared with the client path:** `client/hooks/client_hooks.ts`'s
    `useTranslations` also calls `getTranslationsImpl` (falling back to the
    same `${locale}-${namespace}` key format) and so also writes into this
    module-scope Map wherever that module is loaded — harmless in a browser
    (its own JS heap, no cross-request sharing), but the Map isn't purely a
    server-request cache by construction, only by how this package happens
    to be consumed today.
- `languageDetecotr` (`src/server/functions/get_user_locale.ts`) —
  `get_user_locale.bench.ts` only (see the `cache()` caveat above; no
  underlying memoization to assert on).
- `languages`/`alternatesLinks` (`src/general/metadata.ts`) and
  `generateIntlSitemap` (`src/config/intl_sitemap.ts`) —
  `metadata.bench.ts`/`intl_sitemap.bench.ts` only, same reason.
- `intlMiddleware` (`src/config/middleware.ts`) — warm (locale cookie
  present) vs. cold (bot-detection + accept-language parsing) request cost,
  measured via `middleware.bench.ts` only. No `.perf.test.ts`: the
  bot-detection check's only memoization is a `cache()` wrapper (see the
  caveat above), so there's no underlying cache to assert on — a prior
  version of this test asserted on the same `Content-Language` response
  header across repeated calls, which held regardless of whether caching
  worked at all (a pure-function-determinism check mislabeled as a caching
  test) and was removed.
- `getAuthenticatedAppForUser` (`src/firebase_auth/server/firebase_server.ts`)
  — memoized via a module-scope `baseApp` variable (not `cache()` itself,
  which only wraps the outer function for per-request dedup); the perf test
  asserts `initializeApp` is called exactly once across three calls within
  the same module scope. Verified by mutation testing: removing the
  memoization makes the test fail.
- `getFirebaseAuthClient` (`src/firebase_auth/client/firebase_client.ts`) —
  genuine module-scope memoization (`cached`) plus in-flight-promise dedupe
  (`cachedPromise`), not `cache()`. The call-count/identity assertions
  already live in the pre-existing coverage test
  (`firebase_client.test.ts`: "returns the same cached client on subsequent
  calls", "dedupes concurrent calls onto a single in-flight promise") — no
  separate `.perf.test.ts` needed. `firebase_client.bench.ts` adds the
  informational warm-path timing.
- `updateSession`'s `isJwtExpired` (`src/firebase_auth/middleware/update_session.ts`)
  — not exported, has no cache (re-parses the JWT on every request by
  design). `update_session.bench.ts` measures the parse cost end-to-end
  through the public `updateSession` entrypoint with a valid vs. malformed
  session cookie. No `.perf.test.ts` for the parse itself — there is nothing
  to assert on there.

## Fixes applied from performance analysis

- **`update_session.ts`'s `refreshIdToken` blocking fetch, amortized via the
  Cloudflare Workers Cache API.** The refresh call to
  `securetoken.googleapis.com` is a genuine network round-trip on Edge
  middleware's critical path, and — unlike most findings in this file — it
  is NOT purely avoidable: `hasSession` gates a real redirect decision
  (guest vs. signed-in), so skipping the refresh outright would send a
  legitimately-signed-in user (valid refresh token, merely-expired ID
  token — the normal steady state for any session older than Firebase's
  ~1hr ID-token lifetime) to the login page. The fix instead memoizes a
  successful refresh result in `caches.default` (Cloudflare's Cache API,
  no binding/config required) keyed by `SHA-256(refreshToken)`, TTL 50min
  (under the ~60min ID-token lifetime). Firebase refresh tokens don't
  rotate on use (the API returns the same `refresh_token` back), so this is
  a pure memoization: a hit skips the fetch entirely, a miss falls through
  to the exact same fetch this function always made, and a failed refresh
  is never cached (so an invalid/revoked token still retries and still
  redirects correctly). `getEdgeCache()` feature-detects `caches.default`
  and no-ops everywhere else (Node, non-Workers Edge runtimes) — those
  environments keep today's exact behavior, paying the round-trip every
  time, same as before this fix. Tested in
  `update_session.test.ts`'s "refresh caching" describe block: cache
  miss/hit/put, cache-unavailable fallback (never throws), and
  never-caching a failed refresh — all mutation-verified.
- **`isJwtExpired`'s clock-skew margin.** Added a 60s margin
  (`CLOCK_SKEW_MARGIN_MS`) so a token expiring in the next minute is
  treated as already expired and refreshed now, rather than handed to the
  client moments from dying and forcing an extra round-trip on the very
  next request. Independent of the caching fix above; both narrow the
  window in which the blocking fetch actually has to run.
- **`middleware.ts`'s per-request dynamic import, memoized.** `await
  import('../firebase_auth/middleware/update_session')` at
  `middleware.ts`'s auth-wiring branch ran on every request (whenever
  `config.firebaseAuth` is set), even though Node/the runtime's own module
  cache means the import always resolved to the same module — the cost
  being paid was the `import()` expression's own microtask/Promise
  overhead, not actually re-loading the module. Fixed the same way
  `firebase_server.ts`'s `baseApp` is memoized: a module-scope
  `updateSessionModule` variable, populated on first use, read thereafter.
  Still fully lazy — consumers who never set `firebaseAuth` never reach the
  branch that assigns it. **No `.perf.test.ts` for this one** — a mocked
  module's factory only runs once per `vi.resetModules()` scope regardless
  of whether the memoization exists (proven experimentally: Node/Vitest's
  own module cache already dedupes repeated `import()` calls to an
  already-loaded specifier at the factory level), so no test-observable
  signal distinguishes memoized from non-memoized behavior in this
  environment. Verified instead via `middleware.bench.ts`'s "firebaseAuth
  configured" describe block, which measures actual wall-clock cost with
  `vi.resetModules()` forcing a real fresh import on the "first call" bench
  vs. none on the "repeat call" bench — a ~79x gap, confirming the fix has
  a real, measurable effect that a call-count assertion could not have
  shown.

## Verifying a perf test is load-bearing, not vacuous

Before trusting a `.perf.test.ts`, mutation-test it once: temporarily break
the caching mechanism it claims to verify (comment out the memoization,
force the cache-check branch to `false`) and confirm the test fails. If it
still passes, the assertion isn't actually anchored to the mechanism —
rewrite it. This is how the dead `translationFunctionsCache` read (see
above) and the vacuous `cache()`-based middleware assertion were both
caught in practice.

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
