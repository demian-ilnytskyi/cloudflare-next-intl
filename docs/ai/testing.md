# Testing — `package/vitest.config.ts` and coverage conventions

## Setup

- Test runner: vitest, `jsdom` environment (needed because several files are
  React server/client components exercised with `@testing-library/react`).
- Config: `package/vitest.config.ts`. Fixtures: `package/src/test_utils/`
  (`mock_intl_config.ts`, `mock_locale_file/{en,de}.json`,
  `mock_next_server.ts`'s `makeTestRequest` helper for building `NextRequest`
  test fixtures with cookies/headers).
- Path aliases `@intl-config` and `@locale-file` are aliased in
  `vitest.config.ts`'s `resolve.alias` to the `test_utils` fixtures — see
  [`docs/ai/config-and-general.md`](config-and-general.md) for why these
  aliases exist and matter.
- Tests are colocated: `<name>.test.ts(x)` next to the source file it tests,
  not in a separate `test/` or `__tests__/` tree.
- Run: `cd package && npm test` (= `vitest run --coverage`).

## Coverage: global 100% threshold, with ONE narrow per-file exception

`vitest.config.ts`'s `coverage.thresholds` sets `100: true` globally, but
carries a keyed override for `'src/general/general_functions.ts'` (currently
`{ statements: 87.5, branches: 85.18, functions: 100, lines: 87.5 }`, with an
explanatory comment above it) — see
[`docs/ai/config-and-general.md`](config-and-general.md)'s "3 confirmed-dead
branches" section for why. **This is the only sanctioned per-file
exception.** If you find another file that seems to need one, don't add it
unilaterally — the correct process (established during this file's review)
is:

1. Prove the branch is truly unreachable by tracing the function's own
   control flow (not just "the current tests don't reach it").
2. Do NOT add `/* v8 ignore */` pragma comments to production source to
   force the number up — an earlier attempt at this was reverted after a
   reviewer found one of five such claims was actually wrong and was
   masking a real, reachable, untested branch.
3. Flag the specific unreachable branches to a human for a decision: accept
   a scoped per-file threshold override (what happened for
   `general_functions.ts`), simplify the source to remove the dead code (a
   separate, deliberate follow-up — not bundled into test-only work), or
   accept the global threshold dropping (not preferred, weakens the bar for
   every other file too).

## `coverage.exclude` — deliberately excluded, not just untested

- All `src/**/index.ts` barrel re-export files (no branch logic).
- `src/types/types.ts`, `src/types/intl_config.d.ts`,
  `src/types/locale_file.d.ts` — type-only, zero runtime, correctness
  enforced by `tsc`, not vitest.
- `src/general/get_layout_states.ts` — 100% commented-out dead code (see
  [`docs/ai/config-and-general.md`](config-and-general.md)).
- `src/test_utils/**` — the fixtures/helpers themselves aren't
  product code under test.

## Mocking conventions established in this suite

- `next/headers`'s `cookies()`, `next/navigation`'s `notFound()`/
  `usePathname()`/`useSearchParams()`, and `next/dynamic` are mocked
  per-test-file with `vi.mock(...)`, never a real Next.js app boot.
- Anything wrapped in React's `cache()` (see
  [`docs/ai/server.md`](server.md)) needs `vi.resetModules()` +
  dynamic `import()` per test that requires a non-memoized call — a plain
  top-of-file `import` will get a stale cached result across tests in the
  same file.
- `document.cookie` is read/written directly in jsdom (no mock needed for
  `client/functions/{get,set}_cookie.ts` tests) — but forcing the
  "cookie read/write throws" branch requires temporarily replacing
  `Document.prototype.cookie`'s getter/setter via
  `Object.defineProperty`, then restoring the original descriptor after the
  assertion (see `get_cookie.test.ts`/`set_cookie.test.ts` for the pattern).
