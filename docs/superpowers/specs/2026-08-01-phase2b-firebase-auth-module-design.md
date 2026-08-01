# Phase 2b: Optional `firebase_auth` Submodule — Design

## Context

`cloudflare-next-intl` is currently pure i18n/routing with zero Firebase dependency. This phase adds Firebase email/password auth as a **fully optional, isolated, tree-shakeable submodule** — ports the proven session-cookie + middleware + client/server-provider pattern from `/Volumes/External/clarivant/CRV` (a production consumer of this package that layers its own hand-rolled version of this exact pattern on top of `cloudflare-next-intl`), generalizing it into the package itself so consumers don't have to re-implement it.

This is Phase 2 of the 3-phase project described in `docs/superpowers/specs/2026-08-01-phase1-package-test-coverage-design.md`. Phase 1 (100% coverage for the existing package) ships first; Phase 3 (100% coverage for this module + perf pass) ships after this one. Test coverage for `firebase_auth` itself is **out of scope here** — Phase 3 covers it, per the existing phase split.

## Goals

- New `src/firebase_auth/**` directory, self-contained: nothing outside it imports from it, and it imports nothing that isn't either (a) already a package dependency, (b) `firebase` itself (new **peer dependency**, optional), or (c) this package's own already-public exports (e.g. `cache_variables` pattern, `cookie_key` pattern) — duplicated locally rather than reaching into `general/`/`config/` internals, so the module has no coupling to non-exported internals and stays deletable as a unit.
- Zero cost for consumers who don't use it: `firebase` is `peerDependenciesMeta.firebase.optional = true`; nothing in `src/index.ts`, `src/client/index.ts`, `src/server/index.ts`, or `src/config/**` imports from `src/firebase_auth/**`. A consumer who never imports a `firebase-auth`-prefixed subpath never pulls in `firebase/app` or `firebase/auth`.
- **Zero-code enablement — the actual bar, not just "one boolean plus some wiring":** a consumer sets `firebaseAuth: { enabled: true, ...requiredFields }` in their existing `setIntlConfig(...)` call and writes **no other code at all**. They do not add a new middleware call, do not wrap a new provider, do not import any of the `firebaseAuth*` subpaths themselves. `intlMiddleware` (the function they already call in `middleware.ts`) internally calls the session-update logic itself when `config.firebaseAuth?.enabled` is true; `IntlProvider` (`serverProvider`, the component they already wrap their root layout in) internally wraps its children in the auth server provider itself under the same condition. The `firebaseAuth*` subpaths from the file structure below exist as internal implementation detail (and as an escape hatch for consumers who want manual control instead of the default auto-wiring — see "Manual override" below), not as required consumer-facing imports.
- Localization of user-facing auth strings (error messages, unless overridden) is opt-in and defaults to English — ships via the package's *existing* translation mechanism (`getTranslationsImpl`/`@locale-file`) so a consumer who already has i18n set up gets translated auth errors for free by adding a `firebaseAuth` namespace to their locale JSON files; a consumer who does nothing gets the English defaults baked into the module.
- Auth logic (session cookie mint/refresh/clear, `onIdTokenChanged` sync, server-side token validation via `initializeServerApp`, middleware redirect rules for guest/auth-page/signed-in) is ported faithfully from CRV's implementation, but generalized: CRV's app-specific route lists (`AppLinks`, `whiteListLink`, `isAuthPath`) become consumer-supplied config fields instead of hardcoded imports.

## Non-goals

- No support for OAuth/social providers, phone auth, or multi-factor — email/password only, matching CRV's current scope. Can be extended later without breaking this design (each provider would be an additive export).
- No admin-SDK / server-side user management (create/delete/list users) — this is client-auth + session-verification only, same boundary CRV draws.
- No test coverage in this phase (Phase 3).
- No changes to any existing (non-firebase_auth) file's public behavior.

## Source Material (ported from, not copied verbatim)

Read and generalized from `/Volumes/External/clarivant/CRV`:
- `src/shared/data_provider/firebase_client_provider.ts` — client app/auth singleton init, guarded by `apiKey` presence.
- `src/shared/data_provider/firebase_data_provider.ts` — `getAuthenticatedAppForUser` (React `cache()`-wrapped, per-request `initializeServerApp` keyed off the session cookie, `auth.authStateReady()`, try/catch → `null` on invalid/revoked token).
- `src/shared/data_provider/auth_user_cache.ts` — module-scope sync cache (`cachedUser`/`cachedLoading`), mirrors this package's own `general/cache_variables.ts` pattern.
- `src/shared/components/auth/auth_user_provider.tsx` — client provider: `onIdTokenChanged` listener, session-cookie sync (force-refreshed ID token), consecutive-null debounce (2 nulls before treating as signed-out, to tolerate client-SDK clock-skew hiccups), redirect-on-auth-state-mismatch effect, `reloadUser`/`sendVerificationEmail`/`logout` actions.
- `src/shared/components/auth/auth_user_server_provider.tsx` — server provider: resolves user server-side, does the *authoritative* pre-render redirect (guest→login, signed-in→home on auth pages), passes `initialUser` (a serializable projection of `User`) down to the client provider to avoid a loading flash.
- `src/shared/components/auth/use_auth_user.ts` / `use_auth_user_server.ts` — client/server hook pair reading the provider's context / the cached server lookup respectively.
- `src/shared/components/auth/auth_actions.ts` — `createLoginAction`/`createSignUpAction`/`createForgotPasswordAction`: factory functions taking a `messages` object (this is the existing localization seam in CRV — this phase formalizes it into the package's real i18n mechanism instead of a plain passed-in object).
- `src/shared/utils/firebase_auth_error_helper.ts` — Firebase error-code → user message map. Becomes the localization source: keys stay the Firebase error codes, values become translation keys instead of hardcoded English strings.
- `src/shared/utils/middleware_auth_util.ts` — `updateSession(request, rewriteUrl?, locale?)`: JWT expiry check (`isJwtExpired`, manual base64url decode, no `firebase/auth` import — deliberately Edge-safe), refresh-token exchange via Google's Secure Token REST API (`securetoken.googleapis.com`, no SDK needed), guest/auth-page/signed-in redirect matrix, cookie set/clear.

## File Structure

```
package/src/firebase_auth/
  index.ts                          # barrel: re-exports the public surface (mirrors src/client/index.ts style)
  types.ts                          # FirebaseAuthConfig, SerializedAuthUser, AuthFormState, AuthActionMessages
  client/
    firebase_client.ts              # generalized firebase_client_provider.ts — app/auth singleton, config from env vars
    auth_user_cache.ts              # generalized auth_user_cache.ts (kept local, not shared with general/cache_variables.ts — different value shape)
    auth_user_provider.tsx          # generalized auth_user_provider.tsx — takes route-check callbacks as props/config instead of importing AppLinks
    use_auth_user.ts                # generalized use_auth_user.ts
    auth_actions.ts                 # generalized auth_actions.ts, messages now resolved via getTranslationsImpl under a `firebaseAuth` namespace
  server/
    firebase_server.ts              # generalized firebase_data_provider.ts's getAuthenticatedAppForUser
    auth_user_server_provider.tsx   # generalized auth_user_server_provider.tsx
    use_auth_user_server.ts         # generalized use_auth_user_server.ts
  middleware/
    update_session.ts               # generalized middleware_auth_util.ts's updateSession + isJwtExpired + refreshIdToken
  error_messages/
    firebase_auth_error_helper.ts   # error-code → translation-key map (English defaults inline as fallback when no locale file entry exists)
    default_messages.en.ts          # the English fallback strings, keyed identically to the translation namespace, so a consumer with zero i18n setup still gets working messages

package/src/types/types.ts          # MODIFY: add FirebaseAuthRoutingConfig fields to RoutingConfig (all optional)
package/src/config/init_config.ts   # MODIFY: no behavior change needed — setIntlConfig is already a passthrough identity fn; RoutingConfig gaining new optional fields is enough
package/src/config/middleware.ts    # MODIFY: intlMiddleware calls firebase_auth's updateSession internally when config.firebaseAuth?.enabled — see "Auto-wiring" below
package/src/server/components/server_provider.tsx  # MODIFY: IntlProvider calls resolveAuthUserAndRedirect internally when config.firebaseAuth?.enabled, passes result to LocationzationClientProvider — see "Auto-wiring" below
package/src/client/components/client_provider.tsx   # MODIFY: LocationzationClientProvider wraps children in the client AuthUserProvider internally when config.firebaseAuth?.enabled, INSIDE LocaleContext.Provider — see "Auto-wiring" below
package/package.json                # MODIFY: add optional peerDependency "firebase", add 6 new "./firebaseAuth*" exports subpaths (useFirebaseAuthUser is one conditional subpath covering both environments, not two)
```

## Config Surface

Extend `RoutingConfig` (in `package/src/types/types.ts`) with one new optional field:

```ts
export interface FirebaseAuthRoutingConfig {
  enabled: true;
  loginPath: string;
  homePath: string;
  verifyEmailPath?: string;
  isAuthPath: (path: string) => boolean;
  whiteListPaths?: readonly string[];
  sessionCookieMaxAge?: number;   // seconds, default 5 days (matches CRV's SESSION_COOKIE_MAX_AGE)
  refreshTokenCookieMaxAge?: number; // seconds, default 365 days
  /**
   * Default `true`: `intlMiddleware` and `IntlProvider` automatically wire in
   * session-refresh middleware logic and the auth server provider — no other
   * code required. Set to `false` to opt into manual wiring instead (import
   * `firebaseAuthMiddleware`/`firebaseAuthServerProvider` yourself) if you
   * need explicit control over where/when they run.
   */
  autoWire?: boolean;
}
```

Added to `RoutingConfig` as:

```ts
firebaseAuth?: FirebaseAuthRoutingConfig;
```

A consumer turns the module on with:

```ts
export default setIntlConfig({
  locales: ["en", "de"] as const,
  defaultLocale: "en",
  firebaseAuth: {
    enabled: true,
    loginPath: "/login",
    homePath: "/",
    isAuthPath: (p) => p === "/login" || p === "/signup",
  },
});
```

Every `firebase_auth/**` module reads this via the same `@intl-config` alias the rest of the package already uses (`import config from '@intl-config'`) — no second config file. If `config.firebaseAuth?.enabled` is not `true`, every exported function in the module becomes a documented no-op/pass-through (matching CRV's own `if (!auth) return ...` guards, generalized to `if (!config.firebaseAuth?.enabled)`).

Firebase project credentials stay environment-variable-driven, same as CRV (`NEXT_PUBLIC_FIREBASE_*`), read directly inside `firebase_client.ts`/`firebase_server.ts` — no new config field needed for these, since they're secrets/env-scoped, not routing config.

## Auto-wiring — the mechanism that makes this genuinely zero-code

Two existing entry points a consumer already calls get one additional internal step each, gated on `config.firebaseAuth?.enabled`:

### `intlMiddleware` (`src/config/middleware.ts`)

After locale routing produces its `response` (rewrite/redirect/next, exactly as today) and before returning it, `intlMiddleware` calls:

```ts
if (config.firebaseAuth?.enabled) {
    response = await updateFirebaseAuthSession(request, response, effectiveLocaleForRequest);
}
```

This requires generalizing `firebase_auth`'s `updateSession` (see File Structure below) to accept an already-built `NextResponse` to layer its cookie set/clear and redirect decisions onto, rather than building its own rewrite/next response from scratch the way the Phase-2b-original draft had it — the locale-routing response and the auth response must be the SAME response object so neither one's cookies/headers get dropped. Concretely: `updateSession`'s signature changes from `(request, rewriteUrl?, locale?)` to `(request, baseResponse, locale)`, and instead of constructing `NextResponse.next()`/`.rewrite()`/`.redirect()` itself for the pass-through cases, it either returns `baseResponse` unchanged (pass-through) or returns a NEW `NextResponse.redirect(...)` (guest/auth-page cases) — cookie set/clear operations apply to whichever response is actually returned.

A consumer who does not set `firebaseAuth.enabled` sees `intlMiddleware` behave exactly as today (Phase 1's behavior, byte-for-byte) — the entire block above is skipped, and — critically — is never even reached at the *type* level in a way that would require `firebase/auth` to load, since the `updateFirebaseAuthSession` import inside `middleware.ts` must be a **dynamic import** (`await import('../firebase_auth/middleware/update_session')`), not a static top-of-file import. A static import would defeat the whole "zero cost when unused" goal from this spec's Goals section, because `middleware.ts` is itself imported unconditionally by every consumer via the `./middleware` subpath.

### `IntlProvider` (`src/server/components/server_provider.tsx`) + `LocationzationClientProvider` (`src/client/components/client_provider.tsx`)

**This requires care in TWO files, not one** — a naive "wrap `IntlProvider`'s children in the auth server provider" approach breaks, because the client `AuthUserProvider` (used internally by the auth server provider) calls this package's own `usePathname()`/`useLocale()`, which read `LocaleContext` — established by `LocationzationClientProvider`, which today renders *inside* `IntlProvider`, not outside it. If the auth wrapping wrapped `IntlProvider`'s children (i.e. wrapped OUTSIDE `LocationzationClientProvider`), the client auth provider would render before `LocaleContext` exists and crash — this package's hooks intentionally throw when rendered outside their provider (see `.agent/.sub-rules/packages/server-client-split.md`).

The fix: split the auth-provider work into (a) the server-side resolve-user-and-redirect check, which has no dependency on `LocaleContext` and can run inside `IntlProvider` before `LocationzationClientProvider` renders, and (b) the client-side session-sync provider, which must render *inside* `LocationzationClientProvider`, after `LocaleContext.Provider` is established:

```tsx
// server_provider.tsx (IntlProvider) — runs BEFORE LocationzationClientProvider
let initialAuthUser = null;
if (config.firebaseAuth?.enabled && config.firebaseAuth.autoWire !== false) {
    const { resolveAuthUserAndRedirect } = await import('../../firebase_auth/server/auth_user_server_provider');
    initialAuthUser = await resolveAuthUserAndRedirect();
}
return <LocationzationClientProvider language={language} messages={messagesValue} initialAuthUser={initialAuthUser}>
    {children}
</LocationzationClientProvider>;
```

```tsx
// client_provider.tsx (LocationzationClientProvider) — auth provider renders INSIDE LocaleContext.Provider
let providedChildren = children;
if (config.firebaseAuth?.enabled && config.firebaseAuth.autoWire !== false) {
    const AuthUserProvider = dynamic(() => import('../../firebase_auth/client/auth_user_provider'));
    providedChildren = <AuthUserProvider initialUser={initialAuthUser}>{children}</AuthUserProvider>;
}
return <LocaleContext.Provider value={{ language, messages }}>
    {providedChildren}
</LocaleContext.Provider>;
```

Both dynamic imports must stay dynamic, never static — both files are reached via `./serverProvider`, which every consumer using `IntlProvider` already imports regardless of auth usage.

The consumer's root layout code is **unchanged** from the README's existing example — they still just do `<IntlProvider language={locale}>{children}</IntlProvider>`; the full auth flow (server-side redirect check + client-side session sync, correctly nested relative to `LocaleContext`) happens invisibly inside it once the config flag is on. This is a genuine auto-wire of BOTH the server and client provider — an earlier draft of this spec incorrectly described only the server provider as auto-wired and the client provider as something the consumer must import themselves; that was wrong and is corrected here.

### What this means for the client-side UI pieces

`useAuthUser` (either environment) and `auth_actions.ts`'s form actions are NOT auto-injected anywhere — there is no equivalent auto-wiring point for these on the *consumer's own* login/signup page or navbar, because the package cannot know where the consumer wants a "you are logged in as X" UI or a login form to render. These remain genuinely opt-in imports the consumer writes themselves (e.g. `import useAuthUser from 'cloudflare-next-intl/useFirebaseAuthUser'` inside their own navbar component) — this is not a violation of the zero-code goal, since that goal is scoped to "auth *mechanics* work (redirects, session persistence, token refresh) the moment the flag is on," not "the package invents UI the consumer never asked for." Document this distinction clearly in `.agent/.sub-rules/packages/firebase-auth.md` so it isn't mistaken for an oversight.

### Manual override (escape hatch)

A consumer who wants explicit control instead of the default auto-wiring (e.g. they need to run their own middleware logic between locale routing and auth, or want the auth server provider somewhere other than wrapping all of `IntlProvider`'s children) can set `firebaseAuth.enabled` to `true` AND pass `firebaseAuth.autoWire: false` — in that case `intlMiddleware`/`IntlProvider` skip the internal calls above, and the consumer is expected to import `cloudflare-next-intl/firebaseAuthMiddleware`/`cloudflare-next-intl/firebaseAuthServerProvider` themselves, exactly as earlier drafts of this spec assumed for every consumer. Default (`autoWire` omitted) is `true` — zero-code is the default experience, manual wiring is the deliberate opt-out.

## Public API (package.json exports)

New subpaths, following the existing flat-subpath convention (`./LocaleLink`, `./usePathname`, etc.) rather than nesting under one nested nested `./firebase-auth` nested export, since this repo's convention (per `.agent/.sub-rules/packages/package-authoring.md`) is one subpath per consumable unit. These remain part of the public surface for the manual-override path and for the client-side pieces documented above — they are simply no longer the *primary* way most consumers interact with the module:

```jsonc
"./firebaseAuthClientProvider": { "types": "...auth_user_provider.d.ts", "import": "...auth_user_provider.js" },
"./firebaseAuthServerProvider": { "types": "...auth_user_server_provider.d.ts", "import": "...auth_user_server_provider.js" },
"./useFirebaseAuthUser": {
  "react-server": { "types": "...use_auth_user_server.d.ts", "import": "...use_auth_user_server.js" },
  "default": { "types": "...use_auth_user.d.ts", "import": "...use_auth_user.js" }
},
"./firebaseAuthActions": { "types": "...auth_actions.d.ts", "import": "...auth_actions.js" },
"./firebaseAuthMiddleware": { "types": "...update_session.d.ts", "import": "...update_session.js" },
"./firebaseAuthClient": { "types": "...firebase_client.d.ts", "import": "...firebase_client.js" }
```

`./useFirebaseAuthUser` is deliberately ONE subpath with a `react-server`/`default` condition split, exactly mirroring the existing `./use` subpath's mechanism (see `useLocale`/`useTranslations`) — not two separate subpaths. This is what makes `useAuthUser()` behave identically to `useLocale()` from a consumer's perspective: the same import resolves to the server implementation when used inside a Server Component and the client implementation inside a Client Component, automatically, with no separate name to remember for each environment. Both implementations return the same `{ user, loading, ... }`-shaped object (the server one wraps it in a `Promise`, matching this package's own existing `getLocale()` async / `useLocale()` sync split) so the field names generalize correctly across environments too.

Deliberately **no** top-level `src/firebase_auth/index.ts` re-export wired into `package.json`'s main `"."` export or `./client`/`./server` barrels — that's what would break tree-shaking for non-auth consumers regardless of `sideEffects: false`, since barrel files re-exporting from a module that top-level-imports `firebase/app` risk bundler analysis pulling it in. `index.ts` inside `src/firebase_auth/` exists only for consumers who explicitly opt into the whole module at once (documented as the "batteries-included" import path); every individual subpath above is also importable standalone.

## Localization Mechanism

`error_messages/firebase_auth_error_helper.ts` calls this package's own `getTranslationsImpl` (from `src/general/general_functions.ts`, already public internal-to-package logic) with namespace `"firebaseAuth"`:

```ts
function firebaseAuthErrorMessage(locale: string, error: unknown): string {
  const code = /* extract error.code, same logic as CRV's helper */;
  const key = ERROR_CODE_TO_KEY[code] ?? 'unknown';
  try {
    const t = getTranslationsImpl(locale, getMessageCache(locale) ?? {}, 'firebaseAuth');
    return t(key);
  } catch {
    return DEFAULT_MESSAGES_EN[key] ?? DEFAULT_MESSAGES_EN.unknown;
  }
}
```

If the consumer's locale JSON has no `firebaseAuth` namespace (the common case for anyone who hasn't opted in to translating these strings), the lookup fails gracefully and `DEFAULT_MESSAGES_EN` (the literal English strings ported from CRV's `messages` record) is returned — this is the "no by default yes" behavior requested: translation is available if the consumer adds the namespace, English works out of the box if they don't.

`.agent/.sub-rules/packages/firebase-auth.md` (created during this phase) documents the exact namespace/key shape a consumer must use to translate these strings, and the auto-wiring mechanism described above.

## Out of scope

- Test coverage for `src/firebase_auth/**` — Phase 3.
- Performance/bundle-size measurement of the new module — Phase 3 (which explicitly covers SSR/caching-aware perf work).
- Updating `example/` to demonstrate the new module — not required for this phase; flagged to the user as a possible follow-up but not blocking.
- Pushing/committing — stays local until reviewed, same as Phase 1.
