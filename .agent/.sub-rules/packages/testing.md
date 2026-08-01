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
- Run: `cd package && npm test` (= `vitest run --coverage`).

## Coverage: global 100%, two narrow named exceptions

`vitest.config.ts`'s `coverage.thresholds` sets 100% globally via a
`perFile` glob, with keyed overrides for:

- `src/general/general_functions.ts` (`{ statements: 87.5, branches: 85.18,
  functions: 100, lines: 87.5 }`) — 3 confirmed-dead branches, see
  [config-and-routing.md](config-and-routing.md).
- `src/config/middleware.ts` (`{ statements: 100, branches: 93.93,
  functions: 100, lines: 100 }`) — 2 unreachable defensive branches (a
  `?? ''` fallback after an equivalent null-guard already returned; an
  empty-string check on a value that can never be empty by construction).

**Only these two are sanctioned.** To add a new one: (1) prove the branch
unreachable by tracing the function's own control flow, not "current tests
don't reach it"; (2) never add `/* v8 ignore */` to production source to
force the number up — a prior attempt was reverted after a reviewer found
one of five such claims was wrong and masked a real untested bug; (3) flag
the specific branches to a human — options are a scoped threshold override,
an isolated dead-code-removal follow-up, or accepting the global threshold
drop (least preferred).

## `coverage.exclude`

All `src/**/index.ts` barrels (no branch logic); `src/types/types.ts` +
`.d.ts` files (type-only); `src/general/get_layout_states.ts` (100%
commented-out dead code); `src/test_utils/**` (fixtures, not product code).

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
