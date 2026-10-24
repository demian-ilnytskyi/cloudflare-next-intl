# Extract `cloudflare-next-intl-intl` (Localization Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the localization core (config, middleware, server/client i18n, general, types, error_handling, client-messages scan) out of `packages/cloudflare-next-intl/` into a new sibling package `packages/intl/` published as `cloudflare-next-intl-intl`, with zero imports of `firebase_auth/**`, `cookie_consent/**`, or `db/**`. `cloudflare-next-intl` becomes an umbrella that re-exports the core and composes auth + cookie consent on top. Every existing `cloudflare-next-intl` export subpath keeps working unchanged.

**Architecture:** Same shape as the finished db split (`packages/db/` → `cloudflare-next-intl-db`, umbrella keeps `src/db/*.ts` as thin wrappers). The core has three coupling points to optional modules today — `config/middleware.ts` (auth session refresh), `server/components/server_provider*.tsx` + `client/components/client_provider*.tsx` (auth + cookie-consent providers), `server/components/helper_script.tsx` (auth/analytics dns-prefetch). Each becomes an extension point in the core (`createIntlMiddleware({ afterResponse })`, provider `children` composition, helper-script `prefetchOrigins` prop); the umbrella fills those points. Core keeps importing `@intl-config` / `@locale-file` aliases exactly as today — they are resolved by the consumer's bundler, so they work from any package in `node_modules`.

**Tech Stack:** TypeScript (`tsc` build), Vitest + jsdom + Testing Library, Next.js 15/16 App Router (`next/server`, `next/headers`, `next/dynamic`), React 19.

**Spec:** No separate spec. Decisions made with the user on 2026-10-24: split shape "core + plugins" (core holds i18n + types + error_handling; umbrella wires auth + cookie_consent into core extension points; no package cycles), package name `cloudflare-next-intl-intl` in `packages/intl/`, all existing umbrella subpaths preserved. Prior art: `docs/superpowers/plans/2026-09-09-extract-db-package.md`, `.agent/.sub-rules/packages/{package-authoring,structure,server-client-split}.md`.

**Follow-up plan:** `docs/superpowers/plans/2026-10-24-extract-auth-package.md` (depends on this plan being merged).

## Global Constraints

- **Never break `cloudflare-next-intl`'s public API.** Every key in `packages/cloudflare-next-intl/package.json#exports` keeps its current `dist/...` target path and exported names. `example/` must build with no source change.
- **No package cycle.** `packages/intl/src/**` must not import `cloudflare-next-intl`, `cloudflare-next-intl-auth`, `cloudflare-next-intl-db`, or any path containing `firebase_auth`, `cookie_consent`, `db/`. Enforced by a test in Task 1.
- **Single module instance.** `general/cache_variables.ts` and `config/intl_config.ts` hold module-level state. The umbrella lists `cloudflare-next-intl-intl` in `dependencies`; any other package that imports core internals (auth, Plan B) lists it in `peerDependencies` so npm dedupes to one copy.
- **Keep `'use client'` / `'use server'` directives on the original module** (in `packages/intl`). Umbrella re-export files carry no directive; a server-action re-export file exports only the action (no other values).
- **Conditional exports preserved.** `./use` keeps `react-server` → server impl, `default` → client impl, in both packages.
- **Dynamic imports stay dynamic.** Anything loaded with `import()` today (e.g. `next/headers.js`, `next/navigation.js`, user-agent module) stays lazily loaded.
- **Coverage:** `packages/intl` 100% per file except the thresholds that move with their files (`general/general_functions.ts`, `config/middleware.ts` keep their existing numbers + comments). Umbrella keeps `min_overall_coverage: 99`.
- **Never remove `README.md` / `llms.txt`** from either package's `files`.
- Moved files that need only import-path edits are verified by their existing tests moving with them; full red/green TDD only for new logic (extension points, umbrella composers).
- No new comments beyond what moved files already carry.

## Review Focus

1. **Server-action re-export across packages** — `report_client_error_action.ts` is `'use server'`; a consumer calling the umbrella `./reportClientError` path must still get a working action reference in a Next 15 and 16 build. Test: Task 8 Step 3 builds `example/` and hits a page that reports a client error.
2. **Duplicate cache module** — if `cloudflare-next-intl-intl` resolves twice (umbrella nested copy vs hoisted), `getTranslations` reads an empty cache after `IntlProvider` filled the other copy. Test: Task 8 Step 2 asserts `npm ls cloudflare-next-intl-intl` in `example/` shows exactly one instance.
3. **Provider nesting order** — `LocaleContext.Provider` must stay outermost so `AuthUserProvider` / `CookieConsentProvider` children can call `useLocale()` / `usePathname()`. Test: Task 5 `client_extensions.test.tsx` renders a child calling `useLocale()` inside both extensions.
4. **Middleware auth runs after locale cookies and is skipped on redirect** — today's ordering. Test: Task 3 `create_intl_middleware.test.ts` "afterResponse not called when redirecting" + "afterResponse receives response carrying locale cookie".
5. **`RoutingConfig` type widening** — consumers type `setIntlConfig({ firebaseAuth, cookieConsent, db })` against the umbrella; those fields must still type-check and autocomplete. Test: Task 6 `types.test-d.ts` (vitest `expectTypeOf`).

---

## File Structure

```
packages/intl/                         # NEW — cloudflare-next-intl-intl
├── package.json  tsconfig.json  vitest.config.ts  vitest.setup.ts  eslint.config.mts
├── README.md  llms.txt  LICENSE  .gitignore  CHANGELOG.md
├── scripts/{write_dist_type,check_exports,check_size}.mjs   # copied from packages/db/scripts
└── src/
    ├── index.ts                       # barrel (= today's umbrella src/index.ts minus theme_switcher/image)
    ├── no_cycle.test.ts               # NEW — forbids optional-module imports
    ├── config/**                      # moved (middleware.ts reshaped, Task 3)
    ├── general/**                     # moved
    ├── server/**                      # moved (server_provider*.tsx + helper_script.tsx reshaped, Tasks 4–5)
    ├── client/**                      # moved (client_provider*.tsx reshaped, Task 5)
    ├── types/**                       # moved; types.ts split, Task 6
    ├── error_handling/**              # moved
    ├── client_messages_scan/**        # moved (general/ imports it)
    └── test_utils/**                  # copied (both packages' tests use it)

packages/cloudflare-next-intl/src/     # umbrella — files below become composers / re-exports
├── config/middleware.ts               # createIntlMiddleware({ afterResponse: authHook })
├── config/init_config.ts              # core setIntlConfig + firebaseAuth normalization
├── server/components/server_provider*.tsx   # core provider + UmbrellaClientExtensions
├── server/components/helper_script.tsx      # core helper script + prefetchOrigins
├── client/components/client_extensions.tsx  # NEW 'use client' — CookieConsentProvider + AuthUserProvider
├── types/types.ts                     # RoutingConfig = IntlRoutingConfig & optional-module fields
└── every other moved path             # one-line `export * from 'cloudflare-next-intl-intl/...'`
```

Stays in the umbrella (not localization core): `cookie_consent/`, `firebase_auth/` (Plan B), `firebase_auth_check/` (Plan B), `db/`, `errors_board/`, `image_optimizer/`, `theme_switcher/`, `vite/`, `dynamic_pages_check/`, `locale_params_check/`, `layout_queries_check/`, `cloudflare_fetch/`, `cloudflare_email/`, `bin/`.

---

### Task 1: Scaffold `packages/intl/` with a passing no-cycle guard

**Files:**
- Create: `packages/intl/{package.json,tsconfig.json,vitest.config.ts,vitest.setup.ts,eslint.config.mts,.gitignore,LICENSE,CHANGELOG.md,README.md,llms.txt}`
- Create: `packages/intl/scripts/{write_dist_type,check_exports,check_size}.mjs` (copy `packages/db/scripts/*`)
- Create: `packages/intl/src/index.ts` (empty `export {};`)
- Test: `packages/intl/src/no_cycle.test.ts`
- Modify: `.github/workflows/package-test-coverage.yaml`, `.github/workflows/package-publish.yaml`

**Interfaces:**
- Produces: package `cloudflare-next-intl-intl@0.1.0`, `"type": "module"`, `"sideEffects": false`, `peerDependencies` = umbrella's `next`, `react`, `typescript` (optional) entries copied verbatim; `dependencies` = `{}` initially.

- [ ] **Step 1: Write `no_cycle.test.ts`** — globs `src/**/*.{ts,tsx}` (excluding itself), asserts no file content matches `/from ['"][^'"]*(firebase_auth|cookie_consent|\/db\/|cloudflare-next-intl-(auth|db)|cloudflare-next-intl['"/])/` and no `import(` of the same. Test name: `"core never imports optional modules"`.
- [ ] **Step 2: Scaffold config** — `tsconfig.json` = umbrella's (same `paths` for `@intl-config`, `@locale-file`); `vitest.config.ts` = umbrella's `test.environment/setupFiles/server.deps/alias` blocks, coverage `include: ['src/**']`, perFile 100 thresholds; `package.json#scripts` identical to `packages/db/package.json#scripts`.
- [ ] **Step 3: Run** `cd packages/intl && rtk npm install && rtk npx vitest run src/no_cycle.test.ts` — Expected: PASS (1 test).
- [ ] **Step 4: CI** — add `intl` filter (`packages/intl/**`), job `build_tests_intl` (`project_type: nextjs`, `working_directory: packages/intl`, `min_coverage: 100`, `min_overall_coverage: 99`, `per_file_exceptions` filled in Task 2) and `publish_intl` input/job mirroring `publish_db`; add to `notify.needs` + `dop_text`.
- [ ] **Step 5: Commit** — `chore(intl): scaffold cloudflare-next-intl-intl package`

---

### Task 2: Move the leaf modules (`types`, `error_handling`, `general`, `client_messages_scan`, `test_utils`)

**Files:**
- Move (`git mv`, with their `*.test.*`, `*.bench.*`, `__snapshots__`): `packages/cloudflare-next-intl/src/{error_handling,general,client_messages_scan}/**` → `packages/intl/src/…`
- Move: `src/types/{index.ts,intl_config.d.ts,locale_file.d.ts}`; copy `src/types/types.ts` (split in Task 6)
- Copy: `src/test_utils/**`
- Modify: `packages/intl/src/error_handling/with_error_handling.ts` (drop `cookie_consent/types.js` import)
- Modify: `packages/intl/src/types/types.ts` (drop the three `cookie_consent` imports, `@firebase/auth` import)
- Create (umbrella re-exports at old paths): one file per moved non-test module, body `export * from 'cloudflare-next-intl-intl/<subpath>';` plus `export { default } from …` where the original had a default export.

**Interfaces:**
- Produces (`packages/intl/package.json#exports`, `types` + `import` pairs under `dist/src/...`): `./errorHandling`, `./installConsoleErrorOverride`, `./installGlobalErrorOverride`, `./stringifyUnknown`, `./formatErrorMessage`, `./defaultIgnoredConsoleErrors`, `./createServerErrorAction`, `./reportClientError`, `./isStaleDeployError`, `./clearClientCache`, `./useStaleDeployRecovery`, `./metadata` — same keys as umbrella. Plus internal subpaths (documented "internal, no semver guarantee" in README): `./internal/cacheVariables` → `general/cache_variables`, `./internal/generalFunctions` → `general/general_functions`, `./internal/reportError` → `error_handling/report_error`, `./internal/clientMessagesScan` → `client_messages_scan/index`.
- `ConsentValue` (`'granted' | 'denied'` — copy the exact union from `cookie_consent/types.ts`) moves to `packages/intl/src/types/types.ts`; umbrella `cookie_consent/types.ts` re-exports it from `cloudflare-next-intl-intl`.

- [ ] **Step 1: `git mv` the directories** and fix relative imports inside `packages/intl` only.
- [ ] **Step 2: Run** `cd packages/intl && rtk npx vitest run src/error_handling src/general src/client_messages_scan src/no_cycle.test.ts` — Expected: PASS, same test count as before the move for those dirs.
- [ ] **Step 3: Add umbrella dependency** `"cloudflare-next-intl-intl": "file:../intl"` to `packages/cloudflare-next-intl/package.json#dependencies`; write re-export shims; keep `vitest.config.ts` coverage exclusions for shim files (`'src/{error_handling,general,client_messages_scan}/**'`).
- [ ] **Step 4: Run** `cd packages/cloudflare-next-intl && rtk npx tsc --noEmit && rtk npx vitest run src/cookie_consent src/errors_board src/firebase_auth` — Expected: PASS (they now import moved code through shims).
- [ ] **Step 5: Move per-file exception** `general/general_functions.ts:87` from umbrella CI job to `build_tests_intl`.
- [ ] **Step 6: Commit** — `refactor(intl): move error_handling, general, types to cloudflare-next-intl-intl`

---

### Task 3: Move `config/` and add `createIntlMiddleware({ afterResponse })`

**Files:**
- Move: `packages/cloudflare-next-intl/src/config/**` → `packages/intl/src/config/**`
- Create: `packages/intl/src/config/create_intl_middleware.ts`
- Modify: `packages/intl/src/config/middleware.ts` (remove `UpdateSessionModule` import + auth block; default export = `createIntlMiddleware()`)
- Modify: `packages/intl/src/config/init_config.ts` (remove `firebaseAuth` normalization; keep `setStaleDeployPatterns` call)
- Test: `packages/intl/src/config/create_intl_middleware.test.ts`; existing `middleware.test.ts` (remove auth cases — they move to umbrella in Step 5)
- Create (umbrella): `packages/cloudflare-next-intl/src/config/middleware.ts` composer, `init_config.ts` composer, re-export shims for `cookie_key.ts`, `intl_config.ts`, `intl_sitemap.ts`, `index.ts`
- Test (umbrella): `packages/cloudflare-next-intl/src/config/middleware.test.ts` (auth cases only)

**Interfaces:**
- Produces:
  - `type IntlMiddlewareContext = { request: NextRequest; locale: string; next: (refreshedRequest: NextRequest) => NextResponse }`
  - `type IntlMiddlewareHook = (response: NextResponse, ctx: IntlMiddlewareContext) => Promise<NextResponse>`
  - `createIntlMiddleware(options?: { afterResponse?: IntlMiddlewareHook }): (request: NextRequest, …sameRestArgsAsToday) => Promise<NextResponse>` — exported from `cloudflare-next-intl-intl/middleware`
  - `localesSet` and every other named export of today's `middleware.ts` unchanged.
  - `setIntlConfig` in core: same generic signature, no `firebaseAuth` handling. Exported as `cloudflare-next-intl-intl/setIntlConfig`.
- Umbrella `config/middleware.ts` default export: `createIntlMiddleware({ afterResponse })` where `afterResponse` = today's auth block body verbatim (dynamic `import('../firebase_auth/middleware/update_session.js')`, `config.firebaseAuth && middlewareEnabled !== false` guard, `ctx.next` replaces the inline rewrite/next lambda). Named exports re-exported from core.
- Umbrella `init_config.ts`: `setIntlConfig(config)` = today's `firebaseAuth` path normalization then `coreSetIntlConfig(normalized)`.

- [ ] **Step 1: Write failing tests** in `create_intl_middleware.test.ts`:
  - `"calls afterResponse with response carrying locale cookie"` — mock config locales `['en','uk']`, request `/uk/x`; hook spy receives a response whose `cookies.get(localeCookieName)?.value === 'uk'` and `ctx.locale === 'uk'`.
  - `"does not call afterResponse when redirecting"` — request `/x` with `localePrefix: 'always'`; spy not called, status 307.
  - `"returns afterResponse result"` — hook returns `NextResponse.next({ headers: { 'x-hook': '1' } })`; result has header `x-hook: 1`.
  - `"ctx.next rewrites when the request was rewritten"` — `localePrefix: 'as-needed'`, `/x` → rewritten; `ctx.next(req)` returns a response with `x-middleware-rewrite` header.
  - `"hook throw is reported and falls back to NextResponse.next"` — hook rejects; `reportError` spy called with `classOrMethodName: 'intlMiddleware'`.
- [ ] **Step 2: Run** `cd packages/intl && rtk npx vitest run src/config/create_intl_middleware.test.ts` — Expected: FAIL "createIntlMiddleware is not exported".
- [ ] **Step 3: Implement** — extract today's middleware body into `createIntlMiddleware`; replace the `config.firebaseAuth` block with `if (!isRedirect && options?.afterResponse) response = await options.afterResponse(response, { request, locale: effectiveLocaleForRequest, next })`.
- [ ] **Step 4: Run** `rtk npx vitest run src/config` — Expected: PASS; `middleware.ts` coverage ≥ its existing threshold (statements 100 / branches 93.93).
- [ ] **Step 5: Umbrella composer + tests** — move today's auth-specific cases from old `middleware.test.ts` to umbrella `config/middleware.test.ts` unchanged in assertions; add `"afterResponse skips when firebaseAuth.middlewareEnabled === false"`. Run `cd packages/cloudflare-next-intl && rtk npx vitest run src/config` — Expected: PASS.
- [ ] **Step 6: Commit** — `refactor(intl): middleware extension point; umbrella wires auth`

---

### Task 4: Move `server/` (except composers) and parametrize `HelperScript`

**Files:**
- Move: `packages/cloudflare-next-intl/src/server/**` → `packages/intl/src/server/**`
- Modify: `packages/intl/src/server/components/helper_script.tsx`
- Create (umbrella): `server/components/helper_script.tsx` composer; shims for `server/index.ts`, `functions/*`, `components/link.tsx`
- Test: `packages/intl/src/server/components/helper_script.test.tsx` (update), umbrella `helper_script.test.tsx` (new, small)

**Interfaces:**
- Produces: `HelperScript({ locale, prefetchOrigins, preconnectOrigins }: { locale?: string; prefetchOrigins?: string[]; preconnectOrigins?: string[] })`. Core renders one `<link rel="dns-prefetch">` per `prefetchOrigins` entry and one `<link rel="preconnect">` per `preconnectOrigins`, after the Content-Language meta, in array order; removes `hasGoogle/hasClarity/hasFirebase/hasTurnstile`.
- Umbrella `IntlHelperScript({ locale })`: computes the five origins exactly as today (`https://www.googletagmanager.com`, `https://www.clarity.ms`, `https://scripts.clarity.ms`, `https://firebaseinstallations.googleapis.com` as prefetch; `https://challenges.cloudflare.com` as preconnect) from `config.cookieConsent` / `config.firebaseAuth`, passes them down. Rendered HTML byte-identical to today for the same config.

- [ ] **Step 1: Failing test (core)** `"renders prefetch and preconnect links in order"` — `prefetchOrigins: ['https://a','https://b'], preconnectOrigins: ['https://c']` → `container.querySelectorAll('link[rel=dns-prefetch]')` hrefs `['https://a/','https://b/']`, one preconnect `https://c/`.
- [ ] **Step 2: Run** — FAIL; **Step 3: implement**; **Step 4: Run** `cd packages/intl && rtk npx vitest run src/server` — PASS.
- [ ] **Step 5: Umbrella test** `"same markup as pre-split for full config"` — snapshot `renderToStaticMarkup(<IntlHelperScript locale="en"/>)` with all of google/clarity/firebase/turnstile set; snapshot taken from current `main` before Step 3 (commit it first).
- [ ] **Step 6: Commit** — `refactor(intl): move server; HelperScript takes origins`

---

### Task 5: Move `client/`; split providers into core + `ClientExtensions`

**Files:**
- Move: `packages/cloudflare-next-intl/src/client/**` → `packages/intl/src/client/**`
- Modify: `packages/intl/src/client/components/client_provider.tsx`, `client_provider_static.tsx` (drop `CookieConsentProvider`, `AuthUserProvider`, analytics dynamic imports, `initialAuthUser`, `skipAuthProvider`, `requiresConsent`, `autoWireDialogs`, `dialogProps`, `updateDialogProps`, `analyticsConfig` props)
- Modify: `packages/intl/src/server/components/server_provider.tsx`, `server_provider_static.tsx` (drop auth resolution + cookie-consent prop resolution; render `{children}` inside client provider)
- Create (umbrella): `packages/cloudflare-next-intl/src/client/components/client_extensions.tsx` (`'use client'`)
- Create (umbrella): `server/components/server_provider.tsx`, `server_provider_static.tsx` composers
- Test: core provider tests (prune auth/cookie cases), umbrella `client_extensions.test.tsx`, umbrella `server_provider.test.tsx` (receives pruned cases)

**Interfaces:**
- Produces (core): `IntlProvider` / `IntlProviderStatic` with today's i18n-only props (`locale`, `messages`/`clientMessages` options, `staticSafe`) and `children`; client provider keeps `LocaleContext.Provider` outermost, `installConsoleErrorOverride` + `installGlobalErrorOverride` calls.
- Produces (umbrella): `ClientExtensions(props: { initialAuthUser?: SerializedAuthUser | null; skipAuthProvider?: boolean; requiresConsent?: boolean; autoWireDialogs?: boolean; dialogProps?: CookieConsentDialogProps; updateDialogProps?: PrivacyPolicyUpdateDialogProps; analyticsConfig?: CookieConsentAnalyticsConfig; children: React.ReactNode })` — body = today's `providedChildren` wrapping logic + the `loadCookieConsentDialog` warm-up effect, moved verbatim.
- Umbrella `IntlProvider`: same public props as today; resolves auth (`resolveAuthUserAndRedirect` dynamic import, unchanged) and cookie-consent server values, renders `<CoreIntlProvider {...i18nProps}><ClientExtensions {...extProps}>{children}</ClientExtensions></CoreIntlProvider>`.

- [ ] **Step 1: Failing umbrella test** `client_extensions.test.tsx`:
  - `"child can call useLocale inside auth + consent wrappers"` — render inside core `LocaleContext.Provider value="uk"` with `firebaseAuth` + `cookieConsent` configured; child `useLocale()` text equals `uk`.
  - `"skips AuthUserProvider when skipAuthProvider"` — `AuthUserProvider` mock not rendered.
  - `"no wrappers when neither module configured"` — renders children only.
- [ ] **Step 2: Run** — FAIL (missing module); **Step 3: implement** both sides; **Step 4: Run** `cd packages/intl && rtk npx vitest run src/client src/server` and `cd packages/cloudflare-next-intl && rtk npx vitest run src/client src/server` — PASS.
- [ ] **Step 5: Commit** — `refactor(intl): core providers; umbrella ClientExtensions`

---

### Task 6: Split `types.ts` — `IntlRoutingConfig` in core, widened `RoutingConfig` in umbrella

**Files:**
- Modify: `packages/intl/src/types/types.ts` — remove `firebaseAuth`, `cookieConsent`, `db` fields from the config interface; rename it `IntlRoutingConfig<L, P>`; remove `FirebaseAuthRoutingConfig`, `CookieConsentRoutingConfig`, `FirebaseAppCheckConfig`, `DeviceBindingConfig`, cookie-consent analytics/dialog types, db re-exports; keep `export type RoutingConfig<L, P> = IntlRoutingConfig<L, P>` alias.
- Modify: `packages/cloudflare-next-intl/src/types/types.ts` — `export * from 'cloudflare-next-intl-intl/types'`; define removed types locally (moved verbatim); `export interface RoutingConfig<L, P> extends IntlRoutingConfig<L, P> { firebaseAuth?: FirebaseAuthRoutingConfig; cookieConsent?: CookieConsentRoutingConfig; db?: DbRoutingConfig }` with the original doc comments.
- Test: `packages/cloudflare-next-intl/src/types/types.test-d.ts`

**Interfaces:**
- Produces: `cloudflare-next-intl-intl/types` exports `IntlRoutingConfig`, `RoutingConfig` (= core), `Locales`, `LocalePrefixMode`, `TranslationObject`, `CookieAttributes`, `MiddlewareCustomHandler`, `ErrorHandlingRoutingConfig`, `ErrorHandlingParams`, `GenerateRoutingConfig`, `ConsentValue`, … (everything not listed as removed above).
- Umbrella `RoutingConfig` name, generics and fields identical to today.

- [ ] **Step 1: Failing type test** — `expectTypeOf<RoutingConfig<['en'], 'always'>['firebaseAuth']>().toEqualTypeOf<FirebaseAuthRoutingConfig | undefined>()`, same for `cookieConsent`, `db`; `expectTypeOf(setIntlConfig).parameter(0).toMatchTypeOf<RoutingConfig<…>>()`.
- [ ] **Step 2: Run** `cd packages/cloudflare-next-intl && rtk npx vitest --typecheck run src/types` — FAIL; **Step 3: implement**; **Step 4:** PASS, then `rtk npx tsc --noEmit` in both packages — 0 errors.
- [ ] **Step 5: Commit** — `refactor(intl): IntlRoutingConfig core type; umbrella widens`

---

### Task 7: Finalize `packages/intl` exports, docs, size/exports checks

**Files:**
- Modify: `packages/intl/package.json#exports` — every umbrella key whose target now lives in core (`.`, `./client`, `./server`, `./geo`, `./getCountry`, `./getTimezone`, `./middleware`, `./setIntlConfig`, `./serverProvider`, `./serverProviderStatic`, `./Link`, `./IntlHelperScript`, `./LocaleLink`, `./usePathname`, `./metadata`, `./setCookieClient`, `./getCookieClient`, `./localeStaticParams`, `./use` (with `react-server` condition), `./types`, error-handling keys from Task 2, `./internal/*` keys)
- Modify: `packages/intl/src/index.ts` = umbrella `src/index.ts` minus `theme_switcher` and `Image` lines
- Modify: `packages/intl/README.md`, `llms.txt` (setup = `@intl-config` + `@locale-file` aliases, copied from umbrella README "Setup"; "internal subpaths" note)
- Modify: `.agent/.sub-rules/packages/structure.md`, `packages.md` (add `packages/intl` row; dependency direction `intl ← auth ← umbrella`, `db` independent)
- Modify: `packages/cloudflare-next-intl/README.md` (one paragraph: core lives in `cloudflare-next-intl-intl`)

- [ ] **Step 1: Run** `cd packages/intl && rtk npm run build && rtk npm run check:exports && rtk npm run check:size` — Expected: all exit 0; `check:exports` resolves every key.
- [ ] **Step 2: Run** `cd packages/cloudflare-next-intl && rtk npm run build && rtk npm run check:exports` — Expected: exit 0, export key list identical to `git show main:packages/cloudflare-next-intl/package.json | jq '.exports|keys'`.
- [ ] **Step 3: Commit** — `docs(intl): exports map, README, agent docs`

---

### Task 8: End-to-end verification in `example/`

**Files:** none modified unless a failure is found.

- [ ] **Step 1: Run** full suites: `cd packages/intl && rtk npm test`, `cd packages/cloudflare-next-intl && rtk npm test` — Expected: PASS, coverage thresholds met.
- [ ] **Step 2: Run** `cd example && rtk npm install && rtk npm ls cloudflare-next-intl-intl` — Expected: exactly one `cloudflare-next-intl-intl@0.1.0` (deduped).
- [ ] **Step 3: Run** `cd example && rtk npm run build && rtk npm run preview` — open `/en`, `/uk`, a page using `getTranslations`, a client component using `useTranslations`, trigger a client error (`reportClientError`), toggle cookie consent — Expected: build succeeds, no console errors, Content-Language/locale cookie set, server action returns 200.
- [ ] **Step 4: Commit** (only if fixes) — `fix(intl): <what>`. Then bump: `cloudflare-next-intl-intl` 0.1.0, umbrella `0.12.0`; `CHANGELOG.md` entries in both.
- [ ] **Step 5: Publish order** — publish `cloudflare-next-intl-intl@0.1.0` first, then replace umbrella `"cloudflare-next-intl-intl": "file:../intl"` with `"^0.1.0"` (same as `cloudflare-next-intl-db` today), rerun Step 2, publish umbrella. Commit — `chore(release): intl 0.1.0, cloudflare-next-intl 0.12.0`.
