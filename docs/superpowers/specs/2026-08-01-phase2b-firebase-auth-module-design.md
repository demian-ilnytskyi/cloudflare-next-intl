# Phase 2b: Optional `firebase_auth` Submodule — Design

## Context

`cloudflare-next-intl` is currently pure i18n/routing with zero Firebase dependency. This phase adds Firebase email/password auth as a **fully optional, isolated, tree-shakeable submodule** — ports the proven session-cookie + middleware + client/server-provider pattern from `/Volumes/External/clarivant/CRV` (a production consumer of this package that layers its own hand-rolled version of this exact pattern on top of `cloudflare-next-intl`), generalizing it into the package itself so consumers don't have to re-implement it.

This is Phase 2 of the 3-phase project described in `docs/superpowers/specs/2026-08-01-phase1-package-test-coverage-design.md`. Phase 1 (100% coverage for the existing package) ships first; Phase 3 (100% coverage for this module + perf pass) ships after this one. Test coverage for `firebase_auth` itself is **out of scope here** — Phase 3 covers it, per the existing phase split.

## Goals

- New `src/firebase_auth/**` directory, self-contained: nothing outside it imports from it, and it imports nothing that isn't either (a) already a package dependency, (b) `firebase` itself (new **peer dependency**, optional), or (c) this package's own already-public exports (e.g. `cache_variables` pattern, `cookie_key` pattern) — duplicated locally rather than reaching into `general/`/`config/` internals, so the module has no coupling to non-exported internals and stays deletable as a unit.
- Zero cost for consumers who don't use it: `firebase` is `peerDependenciesMeta.firebase.optional = true`; nothing in `src/index.ts`, `src/client/index.ts`, `src/server/index.ts`, or `src/config/**` imports from `src/firebase_auth/**`. A consumer who never imports a `firebase-auth`-prefixed subpath never pulls in `firebase/app` or `firebase/auth`.
- Turn-key enablement: a consumer sets one boolean in their `setIntlConfig(...)` call — `firebaseAuth: { enabled: true }` (object, not bare boolean, so future non-breaking additions like `sessionCookieMaxAge` don't require a signature change) — and wires two components/one middleware call the same way they already wire `intlMiddleware`/`IntlProvider`. No new config file, no separate init step.
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
package/package.json                # MODIFY: add optional peerDependency "firebase", add 7 new "./firebase-auth/*" exports subpaths
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

## Public API (package.json exports)

New subpaths, following the existing flat-subpath convention (`./LocaleLink`, `./usePathname`, etc.) rather than nesting under one nested nested `./firebase-auth` nested export, since this repo's convention (per `docs/ai/package-exports.md`) is one subpath per consumable unit:

```jsonc
"./firebaseAuthClientProvider": { "types": "...auth_user_provider.d.ts", "import": "...auth_user_provider.js" },
"./firebaseAuthServerProvider": { "types": "...auth_user_server_provider.d.ts", "import": "...auth_user_server_provider.js" },
"./useFirebaseAuthUser": { "types": "...use_auth_user.d.ts", "import": "...use_auth_user.js" },
"./useFirebaseAuthUserServer": { "types": "...use_auth_user_server.d.ts", "import": "...use_auth_user_server.js" },
"./firebaseAuthActions": { "types": "...auth_actions.d.ts", "import": "...auth_actions.js" },
"./firebaseAuthMiddleware": { "types": "...update_session.d.ts", "import": "...update_session.js" },
"./firebaseAuthClient": { "types": "...firebase_client.d.ts", "import": "...firebase_client.js" }
```

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

`docs/ai/firebase-auth.md` (Phase 2a's stub, filled in during this phase) documents the exact namespace/key shape a consumer must use to translate these strings.

## Out of scope

- Test coverage for `src/firebase_auth/**` — Phase 3.
- Performance/bundle-size measurement of the new module — Phase 3 (which explicitly covers SSR/caching-aware perf work).
- Updating `example/` to demonstrate the new module — not required for this phase; flagged to the user as a possible follow-up but not blocking.
- Pushing/committing — stays local until reviewed, same as Phase 1.
