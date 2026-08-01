# Server — `package/src/server/**`

## Two parallel `useLocale`/`useTranslations` implementations exist on purpose

- `server/functions/use_functions.ts` — the **React Server Component**
  variant, using React's `use()` on the promise returned by `getLocale()`/
  `getMessage()`. Reached via the `cloudflare-next-intl/use` subpath's
  `react-server` export condition (see [`docs/ai/package-exports.md`](package-exports.md)).
- `client/hooks/client_hooks.ts` — the **Client Component** variant, reading
  from React context (`LocaleContext`, set up by `IntlProvider`/
  `LocationzationClientProvider`) instead of `use()`.

Both are named identically (`useLocale`, `useTranslations`) and consumers
always import from the single `cloudflare-next-intl/use` subpath — the
`package.json` `exports` map's conditional resolution (`react-server` vs.
`default`) picks the right one automatically based on where the importing
file runs. **Do not assume these two files are duplicates to consolidate** —
they have genuinely different data sources (promise-based `use()` vs. sync
context) and can't share an implementation without breaking one runtime or
the other.

## `cache()` memoization is a testing trap

`getLocale`, `getMessage`, `getTranslations` (all in `server/functions/server.ts`)
and `useLocale`/`useTranslations` (in `use_functions.ts`) are wrapped in
React's `cache()`. This memoizes per-arguments **for the lifetime of the
module instance** — not per-request like it would inside a real Next.js
server request scope. In tests, this means:

- Calling `getLocale()` twice in the same test file, or across tests that
  share a module import, can silently return a stale cached value instead of
  re-running the underlying logic.
- The correct pattern (used throughout Phase 1's test suite) is
  `vi.resetModules()` + dynamic `await import('./server')` inside each test
  (or each `describe` block) that needs a fresh, non-memoized call.

## `iGetMessage`'s dev-mode cache bypass

`server.ts`'s `iGetMessage` checks `process.env.NODE_ENV === 'development'`
at **module load time** (`const isDev = ...` at the top of the file, not
inside the function) to decide whether to skip the in-memory translation
cache — this lets editing a `messages/*.json` file take effect without a
full server restart in dev. Because `isDev` is captured once at import time,
testing both branches requires setting `process.env.NODE_ENV` *before* the
module is (re-)imported, not just before calling the function.

## `iGetMessage`'s locale-not-configured path calls `notFound()`

If a locale isn't in `localesSet` (from `config/middleware.ts`) and its
message file also fails to dynamically import, `iGetMessage` calls Next's
`notFound()` (dynamically imported from `next/navigation`) rather than
throwing a plain error. If the locale *is* configured but its message file
genuinely doesn't exist, it throws a descriptive `Error` instead — these are
deliberately different failure modes (misconfigured locale vs. missing
translation file) and tests need to mock `next/navigation`'s `notFound` to
throw (it doesn't actually throw in Next's real implementation until deep in
the render pipeline) to assert this path is taken.

## `server_provider.tsx` dynamically imports the client provider

`LocationzationProvider` (exported as `IntlProvider`) uses `next/dynamic` to
lazily load `client/components/client_provider.tsx` — this crosses the
server/client boundary deliberately (a server component rendering a client
component via `dynamic()`). When testing this file, `next/dynamic` needs a
mock that actually resolves and renders the loaded component synchronously
in test conditions, or assertions on rendered children will race the real
async import.
