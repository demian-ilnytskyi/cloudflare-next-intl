# Testing — `package/vitest.config.ts`

Sibling file: [package-authoring.md](package-authoring.md)'s "Testing
packages with optional native/SDK dependencies" section.

## Setup

- vitest, `jsdom` environment (React server/client components exercised via
  `@testing-library/react`).
- Fixtures in `package/src/test_utils/`: `mock_intl_config.ts`,
  `mock_locale_file/{en,de}.json`, `mock_next_server.ts`'s
  `makeTestRequest` helper for `NextRequest` fixtures with cookies/headers.
- `@intl-config`/`@locale-file` aliased in `vitest.config.ts`'s
  `resolve.alias` to these fixtures — see
  [config-and-routing.md](config-and-routing.md).
- Tests colocated: `<name>.test.ts(x)` next to source, never a separate
  `test/`/`__tests__/` tree.
- Run: `cd package && npm test` (= `vitest run --coverage`). This is the
  ONLY reliable way to see the coverage table and any `ERROR: Coverage for
  ...` threshold failures — `npx vitest run <file>` without `--coverage`
  tells you nothing about coverage, and running `--coverage` on a subset of
  test files reports every file *outside* that subset as 0%/failing (each
  file's own threshold check still runs) — always run the full `npm test`
  before trusting a coverage number, never a filtered subset.
- If `npm test`'s output looks truncated, oddly JSON-shaped, or summarized
  as `PASS (N) FAIL (N)` with no coverage table at all, that's this repo's
  `rtk` CLI wrapper intercepting the command — it can suppress console
  output that a test intentionally checks (`console.log`/`console.warn`
  spies), and mocking `node:fs` at the module level (`vi.mock`/`vi.doMock`)
  was confirmed to have zero effect on this project's built-in-module
  resolution when investigated this way. Redirect to a file with
  `npm test > /tmp/out.txt 2>&1` (both streams, correct order) and grep that
  file for `ERROR: Coverage`/`Test Files`/`Tests ` if the direct output is
  unreliable.

## Coverage: global 100%, five narrow named exceptions

`vitest.config.ts`'s `coverage.thresholds` sets 100% globally via a
`perFile` glob (`src/**/!(<excluded names>).{ts,tsx}`), with keyed overrides
for the excluded files. As of the last audit:

- `src/general/general_functions.ts` — 3 confirmed-dead branches (post-loop
  null-check, type guard that cannot fail, loop-exit fallback), see
  [config-and-routing.md](config-and-routing.md).
- `src/config/middleware.ts` — 2 unreachable defensive branches (a `?? ''`
  fallback after an equivalent null-guard already returned; an empty-string
  check on a value that can never be empty by construction).
- `src/errors_board/client/error_detail_view.tsx` — `typeof window !==
  'undefined'` is a defensive SSR-safety guard on a `'use client'`
  component; `window` always exists under `@testing-library/react` +
  jsdom, so the false branch is structurally untestable in this suite.
- `src/vite/auto_dynamic_pages_plugin.ts` — 1 branch (a catch around a
  `writeFile` wrapper's `readFileSync` call, capturing a page's pre-write
  contents for later restore) is structurally hard to isolate: it needs one
  specific `fs.readFileSync` call to fail while an adjacent call on the same
  file, in the same synchronous flow, succeeds. Mocking `node:fs` at the
  module level (`vi.mock`/`vi.doMock`, with or without `vi.resetModules()` +
  a dynamic re-import) was tried and confirmed to have zero effect — the
  mocked implementation was never invoked, verified via a file-based debug
  log (stdout/console spies are unreliable here, see above).
- `src/dynamic_pages_check/resolve_local_imports.ts` — 1 branch is
  unreachable dead code (`bindingsFromClause`'s `clause.trim() === '*'`
  check, reachable only from a bare `import * from '...'`, which isn't
  valid JS/TS syntax — the real `export * from '...'` caller routes around
  this function entirely).

The exact current numeric thresholds live in `vitest.config.ts` itself —
read it, don't trust this list's numbers if it's stale; keep the file names
and reasons here roughly in sync when the set changes.

**Only exceptions with a comment proving the branch unreachable (or
concretely explaining why no test harness in this repo can isolate it) are
sanctioned.** To add a new one: (1) prove the branch unreachable by tracing
the function's own control flow, not "current tests don't reach it" — if
it's reachable, write the test instead (see the worked example below);
(2) never add `/* v8 ignore */` to production source to force the number up
— a prior attempt was reverted after a reviewer found one of five such
claims was wrong and masked a real untested bug; (3) if genuinely stuck,
flag the specific branches to a human — options are a scoped threshold
override (with a comment as detailed as the ones above), an isolated
dead-code-removal follow-up, or accepting the global threshold drop (least
preferred). After fixing coverage, immediately re-run the full `npm test`
(see above) to confirm — a threshold number copied from a partial/subset
run is routinely wrong by a few tenths of a percent (branch totals shift
with which other tests in the same file ran) and will itself fail CI.

**Worked example — verbose/report-shaped code in `check_dynamic_pages.ts`
(glyph/label switch statements, tree-connector `├`/`└` rendering, an
`isApi` route override) looked like a natural threshold-exception
candidate but wasn't**: every branch was reachable by constructing the
right input (an API route file, `mode: 'fix'` vs `'report'`, two reports
instead of one to exercise the "last row" vs "not last row" tree
connector, an object `verbose: { pageLabel: 'path' }` instead of `true`).
Default to writing that test before reaching for an exception.

## `coverage.exclude`

All `src/**/index.ts` barrels (no branch logic); `src/types/types.ts` +
`.d.ts` files (type-only); `src/general/get_layout_states.ts` (100%
commented-out dead code); `src/test_utils/**` (fixtures, not product code).

## Lint: no `eslint-disable` outside test/bench files

`package/eslint.config.mts`'s only sanctioned per-file-glob rule relaxation is
`@typescript-eslint/no-empty-function: "off"` for
`**/*.test.{ts,tsx}` / `**/*.bench.{ts,tsx}` / `**/*.perf.test.{ts,tsx}`
(legitimate noop test/bench stubs). Everything else:

- **Never add a new `eslint-disable` comment to a non-test/bench source
  file.** Fix the root cause instead — e.g. a `typeof import(...)` type
  position becomes a top-level `import type * as X from '...'` + `typeof X`;
  a Proxy/mock needing loose typing gets a narrow local interface or
  `as unknown as <ExactShape>` instead of `any`.
- **Never blanket-disable a whole rule via a new `files: [...]` override in
  `eslint.config.mts`** to make warnings disappear (e.g. turning off
  `no-explicit-any` repo-wide for tests) — a prior attempt at this was
  reverted; fix each `any` at its call site (type mocked Vite/Rollup plugin
  hooks — `resolveId`/`load`/`transform`/`configResolved` — with a small
  local function-signature type instead of casting through `any`).
- A pre-existing disable is only justified when there's genuinely no
  type-safe alternative — e.g. `error_handling/stringify_unknown.ts`'s
  `no-control-regex` disable, needed because the regex must match a literal
  `\x1b` ANSI escape control character. Confirm with a human before removing
  one of these; don't assume every disable is removable.
- The CI quality-gate script (`package_ci_build_and_test.yml`'s ESLint step)
  greps the `stylish` output for the literal words `error`/`warning` —
  **its own summary line ("✖ N problems (0 errors, M warnings)") always
  matches**, so ANY warning at all currently fails the gate, not just
  errors. Until that script is fixed upstream, "0 errors" is not enough —
  drive the real warning count to 0 too.

## Mocking conventions

- `next/headers`'s `cookies()`, `next/navigation`'s
  `notFound()`/`usePathname()`/`useSearchParams()`, `next/dynamic` — always
  `vi.mock(...)` per test file, never a real Next.js app boot.
- Anything wrapped in React's `cache()` — `vi.resetModules()` + dynamic
  `import()` per test needing a non-memoized call; a plain top-of-file
  `import` gets a stale cached result across tests in the same file.
- `document.cookie` — read/write directly in jsdom, no mock needed; forcing
  the "read/write throws" branch requires temporarily replacing
  `Document.prototype.cookie`'s getter/setter via `Object.defineProperty`,
  then restoring the original descriptor after the assertion.
