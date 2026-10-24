# Make `cloudflare-next-intl-intl` Localization-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip everything that is not localization out of `packages/intl` (`cloudflare-next-intl-intl`): error handling and stale-deploy recovery move to a new package `packages/errors` (`cloudflare-next-intl-errors`). Theme/dark-mode (intl's theme script plus the umbrella's `theme_switcher/`) moves to a new package `packages/theme` (`cloudflare-next-intl-theme`). Cookie-consent leftovers move to the umbrella `cloudflare-next-intl`. Every umbrella subpath keeps working.

**Architecture:** Dependency direction becomes `errors`, `theme`, `intl` (each standalone, 0 deps) ← `auth` (peers: intl, errors) ← umbrella (deps: intl, errors, theme, auth). `intl` stops importing `error_handling/*`. It reports its own internal failures through a new config hook, `onError`, which defaults to `console.error`. The umbrella's `setIntlConfig` wires that hook to `reportError` from `errors`. `HelperScript` and the providers already have extension points (`children`, `prefetchOrigins`); the stale-deploy and theme scripts plug into them from the umbrella.

**Tech Stack:** TypeScript (`tsc`), Vitest + jsdom + Testing Library, Next.js 15/16 App Router, React 19.

**Spec:** No separate spec. User request (2026-10-24): "check if cloudflare-next-intl-intl has only the localization part; if not, plan moving out everything it doesn't need." Audit result below. Prior art: `docs/superpowers/plans/2026-10-24-extract-intl-package.md` and `2026-10-24-extract-auth-package.md`.

## Audit: what in `packages/intl/src` is not localization

| Item | Where | Goes to |
| --- | --- | --- |
| Whole error-handling module (17 files: `reportError`, `withErrorHandling`, console/global overrides, client error action, stale-deploy recovery, `clearClientCache`, ...) | `error_handling/**` | `packages/errors` |
| Error types `ErrorHandlingParams`, `ErrorHandlingRoutingConfig`, `ConsentValue` | `types/types.ts:5,211-376` | `packages/errors/src/types.ts` |
| `errorHandling` key on `IntlRoutingConfig` | `types/types.ts:106` | widened `RoutingConfig` in umbrella (and `ErrorsRoutingConfig` in errors) |
| Stale-deploy `<script>`s (early catch + `BUILD_ID` check) and `defaultReloadHtml` | `server/components/helper_script.tsx:8-9,67-285` | `packages/errors/src/stale_deploy_scripts.tsx` |
| Calls to `installConsoleErrorOverride` / `installGlobalErrorOverride` | `server/components/server_provider*.tsx`, `client/components/client_provider*.tsx` | umbrella `ClientExtensions` / server composers |
| `setStaleDeployPatterns` call in `setIntlConfig` | `config/init_config.ts:2,17-19` | umbrella `setIntlConfig` |
| Dark-mode theme script + `ClientHelperScript` + `isDarkCookieKey` | `server/components/helper_script.tsx:308-361`, `client/components/client_helper_script.tsx`, `config/cookie_key.ts:3` | `packages/theme` |
| Umbrella `ThemeSwitcher`, `ThemeSwitcherButton`, icons (not in intl, moved for the same split) | `packages/cloudflare-next-intl/src/theme_switcher/**` | `packages/theme` (umbrella keeps re-exports) |
| Cookie-consent keys `cookieConsentCookieKey`, `privacyPolicyDateCookieKey`; type aliases `CookieConsentCloudflareContext`, `CookieConsentGetCloudflareContext` | `config/cookie_key.ts:4-5`, `types/types.ts:140-141` | umbrella `cookie_consent/` |
| Image-optimizer test helpers (unused in intl) | `test_utils/{image_optimizer_test_helpers,mock_image_loader,mock_images_manifest}.ts` | delete |
| 13 public subpaths `./errorHandling`, `./installConsoleErrorOverride`, ..., `./useStaleDeployRecovery` and the `./internal/*` error subpaths | `package.json#exports` | `cloudflare-next-intl-errors` exports |

**Stays in intl (localization-related):** config/middleware/routing, translations, providers, `Link`/`LocaleLink`/`usePathname`, client-messages scan, metadata/sitemap (hreflang), `getCookie`/`setCookie` (locale cookie), geo `getCountry`/`getTimezone` (locale and timezone context; the middleware forwards these headers), `isBotCookieKey` (SEO-bot locale handling), `generate.env/ctx/getCloudflareContext` (used by geo and middleware), `prefetchOrigins`/`preconnectOrigins`.

## Global Constraints

- **Umbrella public API unchanged.** Every key in `packages/cloudflare-next-intl/package.json#exports` keeps its name and exported symbols. `example/` builds with no source change.
- **`packages/intl` has 0 runtime dependencies** (`scripts/check_size.mjs` stays green). `packages/errors` and `packages/theme` have 0 runtime dependencies too (theme peers: `react`, `next`).
- **No cycles:** `packages/intl/src/**` must not import `error_handling`, `cloudflare-next-intl-errors`, `cloudflare-next-intl-theme`, `isDark`, or `cookieConsent`. `packages/errors/src/**` and `packages/theme/src/**` must not import any `cloudflare-next-intl*` package. Enforced by `no_cycle.test.ts` in each package.
- **Theme cookie name unchanged:** `__is_dark_key__`, so existing visitors keep their theme.
- **Single module instance:** `auth` lists `cloudflare-next-intl-errors` in `peerDependencies`; the umbrella lists it in `dependencies`.
- **Keep `'use client'` / `'use server'`** on the original modules in `packages/errors`. Umbrella re-export files carry no directive.
- **`errors` reads config via `@intl-config`** (same alias, `errorHandling` key). No new alias.
- **Versions:** intl `0.2.0` (breaking: error subpaths removed), errors `0.1.0`, theme `0.1.0`, auth `0.2.0`, umbrella next minor. CHANGELOG entry in each.
- **Coverage:** 100% per file in `packages/errors` and `packages/intl`, except files that keep their existing documented thresholds. Umbrella `min_overall_coverage: 99`.
- No new comments beyond what moved files carry. Moved files with only import-path edits are verified by their moved tests; red/green TDD only for new logic.

## Review Focus

1. **intl errors after the move:** a failing message import inside `getTranslations` must still reach the user's `errorHandling.onError` sink when using the umbrella. Test: Task 5, `init_config.test.ts` "umbrella setIntlConfig routes intl onError to reportError".
2. **Standalone intl with no `onError`:** an internal failure logs via `console.error` and never throws. Test: Task 3, `report_intl_error.test.ts` "defaults to console.error".
3. **Stale-deploy script still renders in prod for umbrella users:** removing it from intl's `HelperScript` must not drop it from the umbrella `IntlHelperScript`. Test: Task 5, `helper_script.test.tsx` "renders stale-deploy-early-catch when NODE_ENV=production".
4. **Theme flicker:** the dark-mode script must still run in `<head>` before hydration, and a stored `__is_dark_key__=true` must apply `dark` before first paint. Tests: Task 2, `theme_script.test.tsx` "adds dark class from cookie"; Task 5, `helper_script.test.tsx` "theme script precedes locale script".
5. **`'use server'` client-error action across packages:** `./reportClientError` from the umbrella still yields a working action in the `example/` build. Test: Task 6, Step 2.

---

## File Structure

```
packages/errors/                         # NEW — cloudflare-next-intl-errors (scaffold = copy of packages/intl minus src)
├── package.json tsconfig.json vitest.config.ts vitest.setup.ts eslint.config.mts
├── README.md llms.txt LICENSE CHANGELOG.md .gitignore scripts/*.mjs
└── src/
    ├── index.ts                         # = today's intl error_handling/index.ts
    ├── no_cycle.test.ts
    ├── types.ts                         # ErrorHandlingParams, ErrorHandlingRoutingConfig, ConsentValue, ErrorsRoutingConfig
    ├── stale_deploy_scripts.tsx         # StaleDeployScripts, defaultReloadHtml
    ├── *.ts                             # moved from intl/src/error_handling/**
    └── test_utils/mock_intl_config.ts

packages/theme/                          # NEW — cloudflare-next-intl-theme (same scaffold)
└── src/
    ├── index.ts                         # ThemeSwitcher, ThemeSwitcherButton, ThemeScript, ClientThemeScript, isDarkCookieKey
    ├── no_cycle.test.ts
    ├── cookie_key.ts                    # isDarkCookieKey = '__is_dark_key__'
    ├── set_theme_cookie.ts              # replaces the intl setCookie import
    ├── theme_script.tsx                 # moved head <script> (setTheme part of intl helper_script)
    ├── client_theme_script.tsx          # moved intl ClientHelperScript
    └── components/*                     # moved from umbrella src/theme_switcher/components/**

packages/intl/src/
├── general/report_intl_error.ts         # NEW — reportIntlError(error, source)
├── types/types.ts                       # IntlRoutingConfig gains onError; error/consent types removed
├── server/components/helper_script.tsx  # meta + prefetch/preconnect + locale script + children
└── (error_handling/, client_helper_script.tsx, image test utils removed)

packages/cloudflare-next-intl/src/
├── error_handling/*.ts                  # re-exports switch to 'cloudflare-next-intl-errors/...'
├── config/init_config.ts                # + onError → reportError, + setStaleDeployPatterns
├── server/components/helper_script.tsx  # core HelperScript + <StaleDeployScripts/> + <ThemeScript/>
├── client/components/client_extensions.tsx  # + install*ErrorOverride + <ClientThemeScript/>
├── theme_switcher/**                    # one-line re-exports from 'cloudflare-next-intl-theme'
└── types/types.ts                       # RoutingConfig adds errorHandling
```

---

### Task 1: Create `packages/errors` with the moved error module

**Files:**
- Create: `packages/errors/**` (scaffold copied from `packages/intl`: configs, scripts, LICENSE, `.gitignore`)
- Move (git mv): `packages/intl/src/error_handling/*` → `packages/errors/src/*`
- Create: `packages/errors/src/types.ts` (types cut from `packages/intl/src/types/types.ts:5,211-376`)
- Create: `packages/errors/src/stale_deploy_scripts.tsx`
- Test: `packages/errors/src/no_cycle.test.ts`, `packages/errors/src/stale_deploy_scripts.test.tsx`
- Modify: `.github/workflows/package-test-coverage.yaml`, `.github/workflows/package-publish.yaml` (add `errors` to the package matrix, same as `intl`)

**Interfaces:**
- Produces: `cloudflare-next-intl-errors` subpaths with the same names intl has today: `.`, `./errorHandling`, `./installConsoleErrorOverride`, `./installGlobalErrorOverride`, `./stringifyUnknown`, `./formatErrorMessage`, `./defaultIgnoredConsoleErrors`, `./createServerErrorAction`, `./reportClientError`, `./isStaleDeployError`, `./clearClientCache`, `./useStaleDeployRecovery`, `./types`, `./staleDeployScripts`, `./internal/{reportError,reportClientErrorAction,reportClientErrorCore,withErrorHandling,matchErrorMessage,mergeReportParams}`.
- Produces: `type ErrorsRoutingConfig = { errorHandling?: ErrorHandlingRoutingConfig }`.
- Produces: `StaleDeployScripts(props: { reloadHtml?: string }): React.JSX.Element | null` (renders both `stale-deploy-early-catch` and the `BUILD_ID` script; returns `null` when `NODE_ENV === 'development'`), `defaultReloadHtml: string`.

- [ ] **Step 1: Write `no_cycle.test.ts`.** Glob `src/**/*.{ts,tsx}` (excluding tests) and assert no file contains `cloudflare-next-intl-intl`, `cloudflare-next-intl-auth`, or `from 'cloudflare-next-intl'`.
- [ ] **Step 2: Write `stale_deploy_scripts.test.tsx`:** with `NODE_ENV=production` it renders `script#stale-deploy-early-catch` whose HTML contains `JSON.stringify(defaultStaleDeployPatterns)` and `'/BUILD_ID'`; with `NODE_ENV=development` it renders nothing; `reloadHtml="<p>x</p>"` appears in the output.
- [ ] **Step 3: Run** `cd packages/errors && npx vitest run src/no_cycle.test.ts src/stale_deploy_scripts.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 4: Move the files:** `git mv` the error files and their tests; cut the two `<script>` blocks and `defaultReloadHtml` from `packages/intl/src/server/components/helper_script.tsx:8-9,67-285` into `stale_deploy_scripts.tsx`; change `../types/types.js` imports to `./types.js`. In `types.ts`, export `ErrorHandlingParams`, `ErrorHandlingRoutingConfig`, `ConsentValue`, and `ErrorsRoutingConfig`. Build `package.json#exports` from the intl entries for these files, with paths minus the `error_handling/` segment.
- [ ] **Step 5: Run** `cd packages/errors && npm test && npm run build && npm run check:exports && npm run check:size`. Expected: all pass, coverage 100%.
- [ ] **Step 6: Commit** `refactor(errors): extract error handling into cloudflare-next-intl-errors`.

### Task 2: Create `packages/theme` (`cloudflare-next-intl-theme`)

**Files:**
- Create: `packages/theme/**` (scaffold like Task 1; peers `react`, `next`; `"sideEffects": false`)
- Move (git mv): `packages/cloudflare-next-intl/src/theme_switcher/components/*` → `packages/theme/src/components/*`; `packages/intl/src/client/components/client_helper_script.tsx` (+ test) → `packages/theme/src/client_theme_script.tsx`
- Create: `packages/theme/src/theme_script.tsx` (the `setTheme`/`isDark` inline script cut from `packages/intl/src/server/components/helper_script.tsx:308-361`), `cookie_key.ts`, `set_theme_cookie.ts`, `index.ts`
- Test: `packages/theme/src/{no_cycle,theme_script,set_theme_cookie}.test.ts(x)`; moved component and client-script tests
- Modify: `.github/workflows/package-test-coverage.yaml`, `.github/workflows/package-publish.yaml` (add `theme`)

**Interfaces:**
- Produces subpaths: `.`, `./ThemeSwitcher` (default `ThemeSwitcher`, same props as today), `./ThemeSwitcherButton`, `./ThemeScript`, `./ClientThemeScript`, `./cookieKey`.
- Produces: `ThemeScript(): React.JSX.Element` (server-safe; renders `<script id="cfni-theme">`), `ClientThemeScript(): null` (`'use client'`), `isDarkCookieKey: '__is_dark_key__'`.
- Produces: `setThemeCookie(isDark: boolean): void`. It writes `__is_dark_key__=<bool>; path=/; max-age=31536000; SameSite=Lax;`, the same string intl's `setCookie` wrote, and swallows errors.

- [ ] **Step 1: Write tests:** `no_cycle.test.ts` (no `cloudflare-next-intl` substring in `src/**` non-test files); `theme_script.test.tsx` "adds dark class from cookie" (set `document.cookie='__is_dark_key__=true'`, eval the rendered script HTML, assert `documentElement.classList.contains('dark')`) and "falls back to prefers-color-scheme when no cookie"; `set_theme_cookie.test.ts` "writes __is_dark_key__=true with path=/".
- [ ] **Step 2: Run** `cd packages/theme && npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Move and create the files.** In `theme_switcher_button.tsx`, replace `setCookie({ name: isDarkCookieKey, value: !isDark })` with `setThemeCookie(!isDark)`, and change imports to local `./cookie_key.js` / `./set_theme_cookie.js`.
- [ ] **Step 4: Run** `cd packages/theme && npm test && npm run build && npm run check:exports && npm run check:size`. Expected: PASS, 100% coverage, `0 dependencies`.
- [ ] **Step 5: Commit** `refactor(theme): extract theme switcher into cloudflare-next-intl-theme`.

### Task 3: intl reports its own failures through `onError`

**Files:**
- Create: `packages/intl/src/general/report_intl_error.ts`
- Modify: `packages/intl/src/types/types.ts` (add `onError` to `IntlRoutingConfig`; delete `errorHandling`, `ErrorHandling*`, `ConsentValue`, `CookieConsent*` aliases)
- Modify (swap `reportError({...})` → `reportIntlError(error, '<same classOrMethodName>')`): `config/create_intl_middleware.ts`, `general/general_functions.ts`, `general/metadata.ts`, `server/functions/get_user_locale.ts`, `server/functions/server.ts`, `client/functions/set_cookie.ts`, `client/functions/get_cookie.ts`
- Modify: `config/init_config.ts` (drop `setStaleDeployPatterns`)
- Test: `packages/intl/src/general/report_intl_error.test.ts`; update each modified file's existing test, which currently mocks `report_error.js`, to mock `report_intl_error.js`

**Interfaces:**
- Produces: `IntlRoutingConfig.onError?: (error: unknown, source: string) => void | Promise<void>`.
- Produces: `reportIntlError(error: unknown, source: string): void`. It reads `config.onError`, calls it, and swallows any throw or rejection. Without `onError` it calls `console.error('[cloudflare-next-intl-intl]', source, error)`.

- [ ] **Step 1: Write tests:** "defaults to console.error" (spy called once with `'[cloudflare-next-intl-intl]', 'getTranslations', err`); "calls config.onError instead of console.error"; "swallows a throwing onError"; "swallows a rejecting onError".
- [ ] **Step 2: Run** `cd packages/intl && npx vitest run src/general/report_intl_error.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `reportIntlError`**, then swap the 7 call sites to use it. Keep each call site's `classOrMethodName` string as the `source`.
- [ ] **Step 4: Run** `cd packages/intl && npm test`. Expected: PASS, with no remaining import of `error_handling` in intl (`grep -r error_handling src` is empty after Task 4).
- [ ] **Step 5: Commit** `refactor(intl): report internal errors via onError hook`.

### Task 4: Remove non-localization leftovers from intl

**Files:**
- Delete: `packages/intl/src/error_handling/` (now empty; its files moved in Task 1), `test_utils/{image_optimizer_test_helpers,mock_image_loader,mock_images_manifest}.ts`
- Modify: `server/components/helper_script.tsx`: keep `Content-Language` meta, prefetch/preconnect links, and the locale-redirect script (the theme part was cut in Task 2 and the stale-deploy scripts in Task 1); render `children` before the locale script
- Modify: `server/components/server_provider*.tsx`, `client/components/client_provider*.tsx` (remove `install*ErrorOverride` calls)
- Modify: `config/cookie_key.ts`, `config/index.ts` (remove `isDarkCookieKey`, `cookieConsentCookieKey`, `privacyPolicyDateCookieKey`)
- Modify: `packages/intl/package.json` (remove the 13 error subpaths, the `./internal/*` error subpaths, and `./internal/clientHelperScript`; version `0.2.0`), `src/index.ts` barrel, `README.md`, `llms.txt`, `CHANGELOG.md`
- Test: `packages/intl/src/no_cycle.test.ts` (extend), `helper_script.test.tsx` (update)

**Interfaces:**
- Produces: `HelperScript(props: { locale?: string; prefetchOrigins?: string[]; preconnectOrigins?: string[]; children?: React.ReactNode })`.

- [ ] **Step 1: Extend `no_cycle.test.ts`** with forbidden substrings `error_handling`, `cloudflare-next-intl-errors`, `isDark`, `setTheme`, `cookieConsent`, `privacyPolicyDate`. Add a `helper_script.test.tsx` case "renders children before the locale script".
- [ ] **Step 2: Run** `cd packages/intl && npx vitest run src/no_cycle.test.ts src/server/components/helper_script.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Make the deletions and edits** listed above.
- [ ] **Step 4: Run** `cd packages/intl && npm test && npm run build && npm run check:exports && npm run check:size`. Expected: PASS, `0 dependencies`.
- [ ] **Step 5: Commit** `refactor(intl)!: localization-only core (0.2.0)`.

### Task 5: Umbrella composes errors + theme back in

**Files:**
- Modify: `packages/cloudflare-next-intl/package.json` (deps `cloudflare-next-intl-errors: file:../errors`, `cloudflare-next-intl-theme: file:../theme`, intl `file:../intl`; `./ThemeSwitcher` export keeps its current `dist/src/theme_switcher/components/theme_switcher.js` target)
- Modify: `src/theme_switcher/index.ts` and `src/theme_switcher/components/theme_switcher.ts(x)` → one-line re-exports from `cloudflare-next-intl-theme/...`; `src/vite/locale_file_plugin.ts:94` keeps pointing at `theme_switcher/index.js`
- Modify: every `packages/cloudflare-next-intl/src/error_handling/*.ts` re-export: `cloudflare-next-intl-intl/<x>` → `cloudflare-next-intl-errors/<x>`
- Modify: `src/config/init_config.ts`: call core `setIntlConfig`, then `setStaleDeployPatterns(config.errorHandling?.staleDeployPatterns)` when set, and default `onError` to `(error, source) => reportError({ error, classOrMethodName: source, config: config.errorHandling })`
- Modify: `src/server/components/helper_script.tsx`: `<CoreHelperScript ...><ThemeScript /><StaleDeployScripts reloadHtml={config.errorHandling?.staleDeployReloadHtml} /></CoreHelperScript>`
- Modify: `src/client/components/client_extensions.tsx` (call `installConsoleErrorOverride` / `installGlobalErrorOverride` with the same arguments as the removed intl provider code, and render `<ClientThemeScript />`); server composers likewise for the server-side console override
- Modify: `src/config/cookie_key.ts` / `src/config/index.ts` (re-export `isDarkCookieKey` from `cloudflare-next-intl-theme/cookieKey`, and the cookie-consent keys removed from intl); `src/types/types.ts` (`RoutingConfig = IntlRoutingConfig & ErrorsRoutingConfig & ...existing`)
- Modify: `packages/auth/package.json` (peer `cloudflare-next-intl-errors: ^0.1.0`, version `0.2.0`) and its 15 `cloudflare-next-intl-intl/internal/reportError` / `reportClientError` imports → `cloudflare-next-intl-errors/...`
- Test: `src/config/init_config.test.ts`, `src/server/components/helper_script.test.tsx`, `src/client/components/client_extensions.test.tsx`, `src/types/types.test-d.ts`

**Interfaces:**
- Consumes: `StaleDeployScripts`, `ErrorsRoutingConfig` (Task 1); `ThemeScript`, `ClientThemeScript`, `isDarkCookieKey` (Task 2); `onError` (Task 3); `HelperScript` `children` (Task 4).

- [ ] **Step 1: Write tests:** "umbrella setIntlConfig routes intl onError to reportError" (`config.onError(err, 'x')` → `reportError` mock called with `{ error: err, classOrMethodName: 'x' }`); "user-supplied onError is kept"; "renders stale-deploy-early-catch when NODE_ENV=production"; "theme script precedes locale script"; "ClientExtensions installs console and global overrides once"; `expectTypeOf<RoutingConfig>().toHaveProperty('errorHandling')`.
- [ ] **Step 2: Run** `cd packages/cloudflare-next-intl && npx vitest run src/config src/server/components src/client/components`. Expected: FAIL.
- [ ] **Step 3: Implement** the edits listed above. Run `npm install` in `packages/cloudflare-next-intl` and `packages/auth`.
- [ ] **Step 4: Run** `cd packages/auth && npm test`, then `cd packages/cloudflare-next-intl && npx tsc --noEmit -p . && npm test`. Expected: PASS, umbrella coverage ≥ 99.
- [ ] **Step 5: Commit** `refactor: umbrella wires errors package and theme script`.

### Task 6: End-to-end check in `example/`

**Files:**
- Modify: `example/package-lock.json` only if `npm install` changes it

- [ ] **Step 1: Run** `cd example && npm install && npm ls cloudflare-next-intl-intl cloudflare-next-intl-errors cloudflare-next-intl-theme`. Expected: one instance of each.
- [ ] **Step 2: Run** `cd example && npm run build && npm start`; open `/`, `/de`, toggle the theme, and trigger a client error. Expected: no theme flicker, locale redirect works, the error reaches the configured `onError` sink, and the build log shows no server-action registration errors.
- [ ] **Step 3: Update** `.agent/.sub-rules/packages/*.md` (repo agent docs) with the new `errors` and `theme` packages and the dependency direction.
- [ ] **Step 4: Commit** `docs: errors and theme packages in agent docs`.

### Publish order (after merge)

`cloudflare-next-intl-errors@0.1.0`, `cloudflare-next-intl-theme@0.1.0` → `cloudflare-next-intl-intl@0.2.0` → `cloudflare-next-intl-auth@0.2.0` → `cloudflare-next-intl`. Then switch the umbrella and auth from `file:` back to `^` ranges.
