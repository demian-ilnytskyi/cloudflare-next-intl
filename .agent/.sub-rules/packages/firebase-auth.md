# Firebase Auth Module — `package/src/firebase_auth/**`

Optional, tree-shakeable submodule. Ported from `/Volumes/External/clarivant/CRV`'s
hand-rolled Firebase auth layer during Phase 2b.

## Enabling it

`firebaseAuth` on `RoutingConfig` holds the Firebase project secrets *and*
route config — there is no separate `enabled` flag. Its mere presence is
what a consumer sets; it does not gate anything by itself. Add it to the
config object passed to `setIntlConfig`:

```ts
firebaseAuth: {
  apiKey: "...",
  authDomain: "my-app.firebaseapp.com",
  projectId: "my-app",
  appId: "...",
  redirectAuthPath: "/login",
  homePath: "/",
  isAuthPath: (p) => p === "/login" || p === "/signup",
}
```

Setting `firebaseAuth` also auto-wires `intlMiddleware`'s redirect/session-
refresh logic for every request (see Middleware wiring below); set
`middlewareEnabled: false` on it to opt that specific piece out while
keeping the rest configured.

If `firebaseAuth` is omitted, `firebase/app`/`firebase/auth` are never
imported by this package's own code — every firebase_auth function does a
dynamic `import('firebase/app')`/`import('firebase/auth')` lazily, only when
actually called, and each one throws a clear `Error` synchronously if
`firebaseAuth` is missing rather than silently no-op'ing. This is stricter
than "optional peer dependency" alone: even having `firebase` installed
does not cause it to load unless a firebase_auth export is called.

## Performance Monitoring (on by default)

`firebase/performance` is initialized automatically whenever `firebaseAuth`
is configured — no opt-in flag, no extra provider, and nothing for the
consumer to render or call. It is wired inside `getFirebaseAuthClient()`
(`client/firebase_client.ts`) and starts collecting automatic traces (page
load, network requests) as soon as that client first resolves.

Two conditions gate it, both in `firebase_client.ts`:

```ts
const isPerformanceEnabled = fa.performance !== false && typeof window !== 'undefined';
```

- `fa.performance !== false` — note `!== false`, not truthiness: `undefined`
  (the normal case, field omitted) means **enabled**. Only an explicit
  `performance: false` disables it.
- `typeof window !== 'undefined'` — the SDK is browser-only, so the import is
  skipped entirely during SSR/RSC rather than initialized and ignored.

To disable it, set the flag on `firebaseAuth`:

```ts
firebaseAuth: { /* ...secrets, routes... */, performance: false }
```

When disabled — or on the server — `import('firebase/performance')` is never
evaluated, so the SDK stays out of the bundle's executed path. This follows
the same lazy-dynamic-import rule as the rest of the module.

`getFirebasePerformanceSync()` IS exported from `firebase_client.ts` (and
re-exported from `firebase_auth/index.ts`), backing the auto-wired
`AutoFirebasePerformanceEvents` component (`client/components/auto_firebase_performance_events.tsx`).
That component is rendered automatically by `client_provider.tsx`'s
`LocationzationClientProvider` whenever `config.firebaseAuth` is set and
`firebaseAuth.performance !== false` — zero consumer steps, same as the
Web Vitals → GA `AutoAnalyticsEvents` pattern in `cookie_consent/`. This
supersedes the module's earlier no-exported-getter stance.

The component auto-tracks every signal as a Firebase Performance custom trace:

- Web Vitals: `web_cls`, `web_fcp`, `web_fid`, `web_lcp`, `web_ttfb`, `web_inp`
- SPA route-change duration: `route_change`
- Main-thread long tasks: `route_long_tasks`
- Slow non-fetch/XHR resource loads: `slow_resource`

Tests: `client/firebase_client.test.ts` → `describe('getFirebaseAuthClient Performance')`
and `client/components/auto_firebase_performance_events.test.tsx` cover the
default-on and `performance: false` paths, as well as signal collection.
Run from `package/` (`cd package && npx vitest run src/...`) to ensure jsdom
environment is applied.

## Isolation rules (do not violate)

- Nothing outside `src/firebase_auth/**` imports from it **statically** —
  three sanctioned dynamic-`import()`-only exceptions, all guarded on
  `config.firebaseAuth`:
  - `src/config/middleware.ts`'s `intlMiddleware` imports
    `firebase_auth/middleware/update_session.ts` to auto-wire redirect/
    session-refresh logic (see Middleware wiring below).
  - `src/server/components/server_provider.tsx`'s `IntlProvider` imports
    `resolveAuthUserAndRedirect` from
    `firebase_auth/server/auth_user_server_provider.tsx` to resolve the
    signed-in user and perform the authoritative redirect before rendering.
  - `src/client/components/client_provider.tsx`'s
    `LocationzationClientProvider` imports the client `AuthUserProvider`
    from `firebase_auth/client/auth_user_provider.tsx` and renders it as a
    CHILD of `LocaleContext.Provider` (not a wrapper around it) — required
    because `AuthUserProvider` calls this package's own `usePathname()`/
    `useLocale()`-equivalent, which read from `LocaleContext` and throw if
    rendered before it exists.
  All three stay dynamic `import()`, never a top-of-file static import —
  `middleware.ts`, `server_provider.tsx`, and `client_provider.tsx` are
  loaded by every consumer regardless of auth usage, so a static import of
  anything under `firebase_auth/**` would defeat "zero cost when unused"
  even for consumers who never set `firebaseAuth`.
- Nothing inside `src/firebase_auth/**` imports from `src/general/**`,
  `src/config/**`, `src/client/**`, `src/server/**` — with ONE sanctioned
  exception: `error_messages/firebase_auth_error_helper.ts` imports
  `getTranslationsImpl`/`getMessageCache` from `src/general/**` to reuse this
  package's existing translation resolution for localized error messages.
- Each unit has its own flat `package.json` exports subpath
  (`./firebaseAuthClientProvider`, etc.) — none of them are wired into the
  top-level `.`/`./client`/`./server` barrels, to keep non-auth consumers'
  bundles free of `firebase/app`/`firebase/auth`.
- `require_config.ts`'s `requireFirebaseAuthConfig(fa)` is the shared guard
  every exported function calls first — throws if `config.firebaseAuth` is
  undefined. Never replace this with a silent no-op/early-return.
- `firebase/app`/`firebase/auth` are only ever imported via dynamic
  `import()` inside function bodies (in `client/firebase_client.ts`,
  `server/firebase_server.ts`, `client/auth_user_provider.tsx`,
  `client/auth_actions.ts`) — never as a static top-level `import ... from
  'firebase/...'`. A static import would defeat the lazy-loading contract
  even if the call itself is gated.

## `useFirebaseAuthUser` — one subpath, two implementations

`cloudflare-next-intl/useFirebaseAuthUser` resolves via `package.json`'s
`react-server`/`default` export conditions to the right implementation for
wherever it's imported — same pattern as this package's own existing
`./use` subpath (`useLocale`/`useTranslations`). Server (`react-server`)
returns `Promise<{ user, loading: false }>`; client (`default`) returns
`{ user, loading, reloadUser, sendVerificationEmail, logout }` synchronously
from context. Both share the `{ user, loading }` field names so `await
useFirebaseAuthUser()` on the server generalizes by analogy from the
client's `useFirebaseAuthUser()`.

The barrel (`firebase_auth/index.ts`) cannot replicate this conditional
resolution (it's a plain module graph), so it exports the two
implementations under distinct names instead:
`useFirebaseAuthUserClient`/`useFirebaseAuthUserServer`. Prefer the
`cloudflare-next-intl/useFirebaseAuthUser` subpath directly over the
barrel for this hook.

## Localization

Error messages resolve through `firebaseAuthErrorMessage(locale, error)`,
which looks up a `firebaseAuth` namespace in the consumer's own locale JSON
(the same files loaded via `@locale-file`). If that namespace/key is
missing, it falls back to `error_messages/default_messages.en.ts`'s English
strings. Key names: `invalidEmail`, `userDisabled`, `invalidCredential`,
`emailAlreadyInUse`, `weakPassword`, `tooManyRequests`,
`networkRequestFailed`, `requiresRecentLogin`, `expiredActionCode`,
`invalidActionCode`, `userTokenExpired`, `unknown`.

## Middleware wiring

`intlMiddleware` (`src/config/middleware.ts`) auto-wires
`middleware/update_session.ts`'s default export `updateSession(request,
baseResponse, locale)` whenever `config.firebaseAuth` is set — no manual
call needed in the consumer's own `middleware.ts`. It runs LAST, after
locale routing, `middlewareHandler`, the locale/bot cookies, and the
`Content-Language`/`x-pathname` headers are already finalized on
`response`, and layers session-cookie validation/refresh and the
guest/auth-page redirect matrix onto that SAME response object (composing,
not discarding, everything set before it) — a fresh redirect response is
only constructed for the guest→login/signed-in→home cases, and even then
copies `baseResponse`'s cookies/headers across first.

`intlMiddleware` also sets an `x-pathname` request header (the
locale-stripped current path) unconditionally — a small, independently
useful addition that `resolveAuthUserAndRedirect` (below) reads to know the
current path server-side, where no request object is otherwise available.

Set `firebaseAuth.middlewareEnabled: false` to keep `firebaseAuth`
configured (for the providers/actions) while opting the automatic
middleware wiring out — e.g. to call `updateFirebaseAuthSession` yourself
with different timing.

## Provider auto-wiring

`IntlProvider` (`server_provider.tsx`) and its client counterpart
`LocationzationClientProvider` (`client_provider.tsx`) auto-wire the full
auth flow whenever `config.firebaseAuth` is set, with zero consumer code
beyond the config object:

- `IntlProvider` calls `resolveAuthUserAndRedirect()` (from
  `auth_user_server_provider.tsx`) after resolving locale/messages — this
  performs the authoritative pre-render redirect (middleware only checks
  cookie *presence*, not validity) and resolves the signed-in user into a
  plain, RSC-serializable `SerializedAuthUser | null`.
- That value is passed down as `LocationzationClientProvider`'s new
  `initialAuthUser` prop, which — only when `firebaseAuth` is set — wraps
  its `children` in the client `AuthUserProvider`, rendered as a CHILD of
  `LocaleContext.Provider` (never a wrapper around it, per the isolation
  rule above).

Client-side pieces (`useFirebaseAuthUser`, the login/signup form actions)
are NOT auto-injected anywhere — the package has no way to know where a
consumer wants login UI to render. These remain explicit imports the
consumer writes in their own components (e.g.
`cloudflare-next-intl/useFirebaseAuthUser` in a navbar).

## Testing notes (filled in during Phase 3)

Not yet covered — see `docs/superpowers/specs/2026-08-01-phase2c-performance-design.md`.
Firebase itself (`firebase/app`, `firebase/auth`) must be mocked in tests;
no real Firebase project or network calls.
