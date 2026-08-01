# Client — `package/src/client/**`

## `LocaleContext` is the client-side source of truth

Created in `client/components/client_provider.tsx`
(`LocationzationClientProvider`, wraps children in
`LocaleContext.Provider`), consumed by `client/hooks/client_hooks.ts`'s
`useLocale`/`useTranslations` and by `client/hooks/use_path_name.ts`'s
`usePathname` (which strips the locale segment from `next/navigation`'s
`usePathname()` result). Any client-side hook here throws a descriptive
`Error` if rendered outside the provider — this is intentional defensive
API design, not a bug to "fix" by adding a default value.

## `get_cookie.ts` / `set_cookie.ts` are for CONSUMER cookies, not the package's own

Both are small, deliberately generic `document.cookie` helpers exported
publicly for app authors to manage their own client-side cookies (e.g. "user
dismissed this banner"). The package's own locale/theme cookies
(`localeCookieName`, `isDarkCookieKey`, `isBotCookieKey` — all in
`config/cookie_key.ts`) are set through `intlMiddleware`
server-side and through `set_cookie.ts` only incidentally (e.g.
`LocaleLinkClient`'s click handler calls the same `setCookie` helper to
persist a manual locale switch). Don't assume every `setCookie`/`getCookie`
call site is package-internal plumbing — check the call site's cookie name.

Both swallow errors (try/catch → `console.error`, no throw) — deliberate,
since a cookie read/write failure (e.g. in a sandboxed iframe) shouldn't
crash the page.

## `LocaleLink` vs `Link` (server) — know which one to reach for

- `client/components/locale_link.tsx` (`LocaleLink`, client-only, wraps
  `locale_link_client.tsx` in a `Suspense` boundary with a disabled-anchor
  fallback) — for linking to a **specific, explicit locale** (a language
  switcher). Takes a required `locale` prop.
- `server/components/link.tsx` (`Link`, server-safe, no `"use client"`) —
  for normal in-app navigation that should **stay on the current locale**.
  Infers the locale automatically from `getLocaleCache()` (the server-side
  cache set by `IntlProvider`/`getLocale()`), no explicit locale prop.

These are genuinely different components for genuinely different use cases —
don't merge them. `LocaleLinkClient`'s `Suspense` fallback (a disabled `<a>`
with `pointer-events-none` appended to `className`) is largely
unobservable in tests unless the child is *actually* lazily loaded (it isn't,
in the current wiring — `LocaleLinkClient` is a direct import inside
`locale_link.tsx`, not `next/dynamic`'d), so don't be surprised if coverage
tools flag that fallback branch as hard to hit through normal render tests.

## Theme cookie flow crosses client/server twice

Dark-mode state is persisted via `isDarkCookieKey` (from
`config/cookie_key.ts`), read in THREE separate places that must stay in
sync if you touch any of them:
1. `server/components/helper_script.tsx` — inline `<script>` (raw JS string,
   not React) that runs before hydration to avoid a flash of wrong theme.
2. `client/components/client_helper_script.tsx` — a `useEffect`-based
   re-sync (belt-and-suspenders after hydration).
3. `theme_switcher/components/theme_switcher_button.tsx` — writes the cookie
   on user toggle via `set_cookie.ts`.

The raw inline-script string in `helper_script.tsx` duplicates cookie-read
logic that also exists as real TypeScript in `get_cookie.ts` — this is
intentional (the inline script must be dependency-free, self-contained JS
that runs before any bundle loads), not an oversight to DRY up.
