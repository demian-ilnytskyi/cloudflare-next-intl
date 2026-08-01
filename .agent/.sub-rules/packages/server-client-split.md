# Server/Client Split — `package/src/server/**`, `package/src/client/**`

Sibling files: [structure.md](structure.md), [config-and-routing.md](config-and-routing.md).

## `cache()` memoization is a testing trap, not just server behavior

`getLocale`/`getMessage`/`getTranslations` (`server/functions/server.ts`) and
`useLocale`/`useTranslations` (`use_functions.ts`) are wrapped in React's
`cache()`. This memoizes per-arguments for the **module instance's
lifetime** — not per-request like inside a real Next.js request scope.
Calling `getLocale()` twice across tests sharing a module import can return
a stale cached value. Pattern: `vi.resetModules()` + dynamic
`await import('./server')` per test needing a fresh, non-memoized call.

## `iGetMessage`'s dev-mode cache bypass is captured at import time

Checks `process.env.NODE_ENV === 'development'` in a top-level
`const isDev = ...`, not inside the function — lets editing
`messages/*.json` take effect without a full dev-server restart. Testing
both branches requires setting `NODE_ENV` *before* the module is
(re-)imported, not just before calling the function.

## `iGetMessage`'s two distinct failure modes

Locale not in `localesSet` AND message file import fails → calls Next's
`notFound()` (dynamically imported from `next/navigation`). Locale IS
configured but its message file genuinely doesn't exist → throws a
descriptive `Error`. These are deliberately different — misconfigured
locale vs. missing translation file — mock `next/navigation`'s `notFound`
to actually throw in tests (it doesn't in Next's real impl until deep in
render) to assert this path.

## `LocaleContext` is the client-side source of truth

Set up by `client/components/client_provider.tsx`
(`LocationzationClientProvider`), consumed by `client_hooks.ts` and
`use_path_name.ts`'s `usePathname` (strips the locale segment from
`next/navigation`'s `usePathname()`). Hooks throw a descriptive `Error` if
rendered outside the provider — intentional defensive API, not a bug.

## `Link` (server) vs `LocaleLink` (client) — different jobs, don't merge

- `server/components/link.tsx` (`Link`) — normal in-app nav staying on the
  **current locale**; infers locale from `getLocaleCache()`, no explicit
  locale prop, server-safe (no `"use client"`).
- `client/components/locale_link.tsx` (`LocaleLink`) — explicit locale
  switching (language switcher); required `locale` prop, wraps
  `locale_link_client.tsx` in a `Suspense` boundary with a disabled-anchor
  fallback. That fallback is a direct import (not `next/dynamic`), so it's
  effectively unreachable in normal render tests — don't be surprised if
  coverage tooling flags it.

## `get_cookie.ts`/`set_cookie.ts` are for CONSUMER cookies

Generic `document.cookie` helpers exported for app authors' own client-side
cookies. The package's own cookies (`localeCookieName`, `isDarkCookieKey`,
`isBotCookieKey`, all in `config/cookie_key.ts`) are set server-side via
`intlMiddleware`, and only incidentally reuse `set_cookie.ts` (e.g.
`LocaleLinkClient`'s click handler for a manual locale switch). Check the
call site's cookie name before assuming it's package-internal plumbing.
Both swallow read/write errors (try/catch → `console.error`, no throw) —
a cookie failure (sandboxed iframe) shouldn't crash the page.

## Theme cookie flow crosses client/server twice — 3 places must stay in sync

`isDarkCookieKey` is read/written in: (1) `server/components/helper_script.tsx`
— raw inline `<script>` string (not React) run pre-hydration to avoid a
theme flash, deliberately dependency-free/self-contained; (2)
`client/components/client_helper_script.tsx` — `useEffect` re-sync after
hydration; (3) `theme_switcher/components/theme_switcher_button.tsx` —
writes on user toggle via `set_cookie.ts`. The inline-script string
duplicating `get_cookie.ts`'s logic is intentional, not DRY-violation debt.
