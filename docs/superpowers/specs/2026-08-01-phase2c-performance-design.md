# Phase 2c: Performance Test Suite + SSR/Cache-Aware Optimization — Design

## Context

Final phase of the 3-phase project (see `docs/superpowers/specs/2026-08-01-phase1-package-test-coverage-design.md`). By this point Phase 1 (100% coverage for the existing package) and Phase 2b (`firebase_auth` module) have shipped. This phase adds: (a) 100% test coverage for `src/firebase_auth/**` (deferred from Phase 2b per the existing phase split), and (b) a performance-test-and-optimization pass covering both the original package and the new module — with explicit attention to SSR cost and caching, since this package's core surface (`intlMiddleware`, `getTranslationsImpl`, `getAuthenticatedAppForUser`-style server lookups) all run per-request on the server.

## Goals

### 1. Firebase auth test coverage (carried over from Phase 2b)

- `src/firebase_auth/**` reaches the same 100%-with-documented-exceptions bar Phase 1 established for the rest of the package, using `package/vitest.config.ts`'s existing `thresholds.perFile` pattern (per-file glob, not a blanket relaxation).
- Mocking additions needed: `firebase/app` (`initializeApp`, `initializeServerApp`, `getApp`, `getApps`), `firebase/auth` (`getAuth`, `onIdTokenChanged`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`, `signOut`, `reload`, `sendEmailVerification`) — all mocked, no real Firebase project or network calls, consistent with the "no real network calls" rule already in Phase 1's spec.
- Any config-gated no-op path (`config.firebaseAuth?.enabled` falsy) gets its own test per exported function, since Phase 2b's design makes this the default, most-common consumer path.

### 2. Performance test suite

Two concerns, kept in separate test files so a slow/flaky perf assertion never blocks the correctness suite:

**a) Micro-benchmarks (`*.bench.ts`, vitest's built-in `bench()`)**
- `getTranslationsImpl` — cached vs. uncached namespace/key resolution, deep vs. shallow nesting. This is the hottest path in the package (called on every server component render that needs translations) and already has a memoization cache (`translationFunctionsCache` in `general/cache_variables.ts`) whose effectiveness has never been measured.
- `intlMiddleware` — full request cycle cost with a warm locale cookie (the fast path) vs. cold (bot-detection + accept-language parsing path), since this runs on literally every request through the middleware.
- `firebase_auth`'s `getAuthenticatedAppForUser`-equivalent — cost of the per-request `initializeServerApp` call pattern (mocked Firebase, so this measures the package's own overhead — object construction, cache-wrapping — not real network latency).

Run via `vitest bench` (separate script, not part of the coverage-gated `npm test`, since bench results are informational/regression-watch, not a pass/fail gate — matches vitest's own recommended split between `test` and `bench`).

**b) SSR-cost regression tests (`*.test.ts`, assertions not benchmarks)**
- Verify `getTranslationsImpl`'s cache is actually hit on a second call with the same `(locale, namespace)` pair within one request scope — assert call-count on a spied loader, not just timing (timing-based assertions are flaky in CI; call-count assertions are deterministic and test the same thing: "did we avoid redundant work").
- Verify React's `cache()`-wrapped functions (`getLocaleCache`'s consumers, and Phase 2b's `getAuthenticatedAppForUser`) are called at most once per request scope when invoked multiple times — same call-count-spy technique.
- Verify `intlMiddleware`'s bot-detection dynamic `import('next/dist/server/web/spec-extension/user-agent')` is not re-imported/re-evaluated per request in a way that defeats the module's own caching (the existing `getIsBotValueCache = cache(getIsBotValue)` wrapper) — assert the underlying `getIsBotValue` is called at most once per distinct user-agent within a `cache()` scope.

### 3. Optimization pass (only if the above surfaces a real regression)

- This phase does **not** presuppose there's a performance problem. The benchmarks and SSR-cost tests are written first; only if they reveal genuine redundant work (a cache that isn't actually preventing a re-computation, a per-request allocation that could be hoisted) does an optimization task get added — and per this repo's existing conventions (see `docs/ai/config-and-general.md`'s note on not bundling "cleanup" into unrelated work), any such fix ships as its own isolated commit/task, flagged to the user first if it changes observable behavior at all.
- One known candidate worth checking regardless (flagged in `docs/ai/config-and-general.md` already): confirm `localesSet` (built once at module scope in `config/middleware.ts`) is genuinely module-scope-cached across requests in the target runtime (Cloudflare Workers / Next.js Edge) and not rebuilt — this is a "verify," not an assumed bug.

## Non-goals

- No new caching *mechanism* is designed here (e.g. no Redis, no external cache layer) — this package has no server-side persistent state today, and adding one is a scope change beyond "performance tests for the existing design."
- No changes to the coverage-gate CI job's role — a new, separate perf-check step is additive to `.github/workflows/`, not a replacement.
- No load/stress testing (concurrent-request simulation) — out of scope; this is single-invocation micro-benchmarking of pure functions and cache behavior, appropriate for a library (not an app) with no server of its own to load-test.

## File Structure

```
package/src/firebase_auth/**/*.test.ts(x)      # coverage tests, one per source file, mirrors Phase 1's colocation convention
package/src/test_utils/mock_firebase_auth.ts   # shared firebase/app + firebase/auth mocks (vi.mock factories), reused across firebase_auth test files
package/src/general/general_functions.bench.ts # micro-benchmark: getTranslationsImpl cached/uncached
package/src/config/middleware.bench.ts         # micro-benchmark: intlMiddleware warm/cold cookie path
package/src/firebase_auth/server/firebase_server.bench.ts  # micro-benchmark: mocked getAuthenticatedAppForUser-equivalent
package/src/general/general_functions.perf.test.ts   # SSR-cost assertion: cache-hit call-count
package/src/firebase_auth/server/firebase_server.perf.test.ts  # SSR-cost assertion: cache() call-count
package/src/config/middleware.perf.test.ts     # SSR-cost assertion: bot-detection cache call-count
package/package.json                           # MODIFY: add "bench": "vitest bench" script
package/vitest.config.ts                       # MODIFY: extend coverage.thresholds.perFile glob to cover src/firebase_auth/**; exclude *.bench.ts and *.perf.test.ts's non-assertion setup from coverage requirements only if they end up untestable as pure logic (expected: no exclusion needed, they test real exported functions)
.github/workflows/package-bench.yaml           # NEW: runs `npm run bench` on PRs touching package/src/**, posts results as a PR comment or job summary (informational, non-blocking — no pass/fail threshold, since bench numbers vary by CI runner)
docs/ai/performance.md                          # Phase 2a's stub, filled in here: what's benchmarked, why call-count assertions over timing, how to add a new bench/perf test
docs/ai/firebase-auth.md                        # extended (not created — Phase 2b created it): testing/mocking notes for src/firebase_auth/**
```

## CI

- Existing `package-test-coverage.yaml` gains `src/firebase_auth/**` to its scope automatically (it just runs `npm test`, which already picks up new files under `src/**`).
- New `package-bench.yaml`: separate job, `npm run bench`, non-blocking (`continue-on-error: true` or posts-only), so benchmark variance never fails a PR — mirrors this repo's existing pattern of keeping coverage (blocking) and other signals (informational) in separate workflow files (see `.github/workflows/package-push-code-coverage.yaml` vs. `package-test-coverage.yaml`).

## Out of scope

- Any production code change beyond what's justified by a genuine, measured regression found during this phase (see "Optimization pass" above).
- `example/` app performance testing.
- Pushing/committing — stays local until reviewed.
