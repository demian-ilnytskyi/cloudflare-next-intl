# Extract `cloudflare-next-intl-auth` (Firebase Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `packages/cloudflare-next-intl/src/firebase_auth/**` and `src/firebase_auth_check/**` into a new sibling package `packages/auth/` published as `cloudflare-next-intl-auth`. `cloudflare-next-intl` keeps every `firebaseAuth*` / `useFirebaseAuthUser` / `getFirebaseAuthUser` / `resolveOptionalAuthUser` / `checkFirebaseAuthConfig` subpath working as a thin re-export, and keeps wiring auth into the core's extension points.

**Architecture:** Dependency direction `cloudflare-next-intl-intl` ← `cloudflare-next-intl-auth` ← `cloudflare-next-intl` (umbrella); `cloudflare-next-intl-db` stays independent. Auth is inherently Next.js-bound (`next/headers`, `next/server`, server actions, React context), so unlike db it is *not* made framework-agnostic: it keeps importing `@intl-config` exactly as today (resolved by the consumer's bundler alias). It reaches core internals only through `cloudflare-next-intl-intl` subpaths (`./internal/reportError`, `./internal/generalFunctions`, `./internal/cacheVariables`, `./reportClientError`, `./types`), listed as a `peerDependency` so there is one shared module instance.

**Tech Stack:** TypeScript (`tsc`), Vitest + jsdom, Next.js App Router, React 19, `@firebase/{app,auth,app-check,performance}` (peer), `jose`, Vite (optional peer, `firebase_auth_check` only).

**Spec:** Decisions with user 2026-10-24 (see `docs/superpowers/plans/2026-10-24-extract-intl-package.md` header). Module conventions: `.agent/.sub-rules/packages/firebase-auth.md`. Prior art: `docs/superpowers/plans/2026-09-09-extract-db-package.md`.

**Prerequisite:** Plan `2026-10-24-extract-intl-package.md` merged (needs `cloudflare-next-intl-intl` internal subpaths, `createIntlMiddleware`, umbrella `ClientExtensions`).

## Global Constraints

- **Never break `cloudflare-next-intl`'s public API.** Keys `./firebaseAuthClient`, `./firebaseAuthClientProvider`, `./firebaseAuthServerProvider`, `./useFirebaseAuthUser` (with `react-server` / `default` conditions), `./getFirebaseAuthUser`, `./resolveOptionalAuthUser`, `./firebaseAuthActions`, `./firebaseAuthMiddleware`, `./checkFirebaseAuthConfig` keep their `dist/...` targets and exported names.
- **Firebase stays lazy.** No static import of `firebase/*` / `@firebase/*` added anywhere; consumers without `firebaseAuth` must not load them (`.agent/.sub-rules/packages/firebase-auth.md`, "Enabling it").
- **Auth must not import the umbrella** (`cloudflare-next-intl`) or `cookie_consent` / `db`. Enforced by `packages/auth/src/no_cycle.test.ts`.
- **Directives stay on originals** (`'use client'` on `client/*`, `'use server'` on `server/*_action.ts`); umbrella shims have none and a server-action shim exports only the action.
- `cloudflare-next-intl-intl` is a `peerDependency` (`^0.1.0`) of auth, `dependency` of umbrella. `@firebase/*` peers move from umbrella to auth with identical ranges; umbrella keeps them too (it re-exports auth). `jose` moves to auth `dependencies`; umbrella drops it only if no other umbrella file imports it (verify with grep in Task 4).
- Coverage: auth 100% per file except existing thresholds that move with files (`firebase_auth_check/check_firebase_auth_config.ts` 96.26/90.7/100/96.26, `load_resolved_firebase_auth.ts` 100/95/100/100, with their comments).
- Moved files with only import-path edits are verified by their moved tests; TDD only for new code.

## Review Focus

1. **Server actions through two package hops** — `sync_session_action`, `restore_session_action`, `clear_session_action`, `exchange_turnstile_token_action` are invoked from client code inside auth; a Next build must still register them. Test: Task 5 Step 2 signs in/out in `example/` and checks `__session` cookie set/cleared.
2. **Translation cache shared with core** — `firebase_auth_error_helper.ts` reads `getMessageCache`/`getTranslationCache`; a second core copy returns raw keys instead of localized errors. Test: Task 2 `firebase_auth_error_helper.test.ts` "uses messages seeded via core setMessageForLocaleCache" importing the setter from `cloudflare-next-intl-intl/internal/cacheVariables`.
3. **Middleware auth hook ordering** — umbrella `afterResponse` must still dynamic-import `update_session` only when `firebaseAuth` is set. Test: Task 4 umbrella `middleware.test.ts` "does not import update_session without firebaseAuth" (spy on `vi.doMock` factory call count = 0).
4. **Vite optional-firebase stub** — `vite/optional_firebase_stub.ts` stubs `firebase/*` for apps without firebase; ids must still match after code lives in `node_modules/cloudflare-next-intl-auth`. Test: Task 4 `optional_firebase_stub.test.ts` "stubs firebase import from auth package path".
5. **Config path normalization** — `setIntlConfig` leading-`/` normalization of `firebaseAuth` paths moves to auth as `normalizeFirebaseAuthConfig`; behavior identical. Test: Task 3 `normalize_config.test.ts` cases copied from umbrella `init_config.test.ts`.

---

## File Structure

```
packages/auth/                          # NEW — cloudflare-next-intl-auth
├── package.json tsconfig.json vitest.config.ts vitest.setup.ts eslint.config.mts
├── README.md llms.txt LICENSE .gitignore CHANGELOG.md
├── scripts/{write_dist_type,check_exports,check_size}.mjs
└── src/
    ├── no_cycle.test.ts                # NEW
    ├── types.ts                        # FirebaseAuthRoutingConfig, FirebaseAppCheckConfig, DeviceBindingConfig (moved from umbrella types.ts) + today's firebase_auth/types.ts
    ├── normalize_config.ts             # NEW — extracted from umbrella init_config.ts
    ├── firebase_auth/**                # moved (git mv), imports rewritten
    └── firebase_auth_check/**          # moved

packages/cloudflare-next-intl/src/
├── firebase_auth/**, firebase_auth_check/**   # one-line re-export shims at every path an exports key or umbrella file uses
├── types/types.ts                      # re-exports 3 auth config types from cloudflare-next-intl-auth/types
├── config/init_config.ts               # calls normalizeFirebaseAuthConfig
└── (middleware.ts, client_extensions.tsx, server_provider*.tsx, errors_board/server/gate.ts, db/resolve_db_config.ts, vite/firebase_auth_check_plugin.ts) # import from shims — unchanged
```

---

### Task 1: Scaffold `packages/auth/`

**Files:**
- Create: `packages/auth/*` config files (copy from `packages/intl/`, name `cloudflare-next-intl-auth`, version `0.1.0`)
- Test: `packages/auth/src/no_cycle.test.ts`
- Modify: `.github/workflows/package-test-coverage.yaml`, `package-publish.yaml` (add `auth` filter/job/publish input, same shape as `intl`)

**Interfaces:**
- Produces `package.json`: `peerDependencies` = `cloudflare-next-intl-intl: ^0.1.0`, `@firebase/app 0.x`, `@firebase/app-check 0.x`, `@firebase/auth 1.x`, `@firebase/performance 0.x`, `next >=12.0.0`, `react` (umbrella range), `vite >=6` (optional), `typescript >=5.0.0` (optional); `dependencies` = `jose` (umbrella range); `devDependencies` add `"cloudflare-next-intl-intl": "file:../intl"`.

- [ ] **Step 1: Write `no_cycle.test.ts`** — `"auth never imports umbrella, cookie_consent or db"`: no `src/**` file matches `/['"](cloudflare-next-intl|cloudflare-next-intl-db)(\/[^'"]*)?['"]|cookie_consent|\/db\//`.
- [ ] **Step 2: Run** `cd packages/auth && rtk npm install && rtk npx vitest run src/no_cycle.test.ts` — PASS.
- [ ] **Step 3: Commit** — `chore(auth): scaffold cloudflare-next-intl-auth package`

---

### Task 2: Move `firebase_auth/**` + auth types

**Files:**
- Move: `packages/cloudflare-next-intl/src/firebase_auth/**` (incl. tests, benches) → `packages/auth/src/firebase_auth/**`
- Create: `packages/auth/src/types.ts` — `FirebaseAuthRoutingConfig`, `FirebaseAppCheckConfig`, `DeviceBindingConfig` moved verbatim (with doc comments) from `packages/cloudflare-next-intl/src/types/types.ts`
- Modify imports in moved files:
  - `../error_handling/report_error.js` (and `../../`, `../../../`) → `cloudflare-next-intl-intl/internal/reportError`
  - `../../error_handling/report_client_error.js` → `cloudflare-next-intl-intl/reportClientError`
  - `../../general/general_functions.js` → `cloudflare-next-intl-intl/internal/generalFunctions`
  - `../../general/cache_variables.js` → `cloudflare-next-intl-intl/internal/cacheVariables`
  - `../types/types.js` / `../../types/types.js` → `../types.js` / `../../types.js`
- Modify: `packages/auth/vitest.config.ts` — add `vi`-aliases for `@intl-config` matching umbrella's; `firebase_auth/types.ts` in coverage exclude.

**Interfaces:**
- Produces `packages/auth/package.json#exports`: `./firebaseAuthClient`, `./firebaseAuthClientProvider`, `./firebaseAuthServerProvider`, `./useFirebaseAuthUser` (`react-server` → `server/use_auth_user_server`, `default` → `client/use_auth_user`), `./getFirebaseAuthUser`, `./resolveOptionalAuthUser`, `./firebaseAuthActions`, `./firebaseAuthMiddleware`, `./types` → `src/types`, `.` → `firebase_auth/index`, plus internal: `./internal/updateSession` (`middleware/update_session`), `./internal/authUserServerProvider`, `./internal/autoPerformanceEvents` (`client/components/auto_firebase_performance_events`), `./internal/authUserProvider` (`client/auth_user_provider`), `./internal/useAuthUserServer`.

- [ ] **Step 1: `git mv`** + rewrite imports with the table above.
- [ ] **Step 2: Add test** in `packages/auth/src/firebase_auth/error_messages/firebase_auth_error_helper.test.ts`: `"uses messages seeded via core setMessageForLocaleCache"` — `setMessageForLocaleCache('uk', { FirebaseAuth: { 'auth/wrong-password': 'Невірний пароль' } })` (use the namespace key the helper already reads), call helper with code `auth/wrong-password` locale `uk`, expect `'Невірний пароль'`.
- [ ] **Step 3: Run** `cd packages/auth && rtk npx vitest run src` — Expected: PASS, same test count as `firebase_auth` had in umbrella + 1.
- [ ] **Step 4: Commit** — `refactor(auth): move firebase_auth to cloudflare-next-intl-auth`

---

### Task 3: Move `firebase_auth_check/**`; extract `normalizeFirebaseAuthConfig`

**Files:**
- Move: `packages/cloudflare-next-intl/src/firebase_auth_check/**` → `packages/auth/src/firebase_auth_check/**`
- Create: `packages/auth/src/normalize_config.ts`
- Test: `packages/auth/src/normalize_config.test.ts`
- Modify: `packages/cloudflare-next-intl/src/config/init_config.ts` (call it)

**Interfaces:**
- Produces: `normalizeFirebaseAuthConfig(fa: FirebaseAuthRoutingConfig | undefined): FirebaseAuthRoutingConfig | undefined` — exact path-field list and `[cloudflare-next-intl] firebaseAuth.${field} ("${value}") is missing its leading "/"` warning text from today's `init_config.ts`; exported at `cloudflare-next-intl-auth/normalizeConfig`.
- `./checkFirebaseAuthConfig` export key in auth → `firebase_auth_check/index`.

- [ ] **Step 1: Failing tests** — move every `firebaseAuth` case from umbrella `config/init_config.test.ts` into `normalize_config.test.ts`, retargeted to `normalizeFirebaseAuthConfig`; plus `"returns undefined for undefined"`.
- [ ] **Step 2: Run** — FAIL (module missing); **Step 3: implement** by moving the block; umbrella `setIntlConfig` = `coreSetIntlConfig({ ...config, firebaseAuth: normalizeFirebaseAuthConfig(config.firebaseAuth) })`.
- [ ] **Step 4: Run** `cd packages/auth && rtk npx vitest run src/normalize_config.test.ts src/firebase_auth_check` and `cd packages/cloudflare-next-intl && rtk npx vitest run src/config` — PASS.
- [ ] **Step 5:** move CI `per_file_exceptions` line `firebase_auth_check/check_firebase_auth_config.ts:96` and the two vitest thresholds to the auth job/config.
- [ ] **Step 6: Commit** — `refactor(auth): move firebase_auth_check; normalizeFirebaseAuthConfig`

---

### Task 4: Umbrella shims + dependency wiring

**Files:**
- Create: re-export shim at each umbrella path referenced by an exports key or an umbrella import: `src/firebase_auth/{index.ts,types.ts}`, `client/{firebase_client,auth_user_provider,use_auth_user,auth_actions}.ts(x)`, `client/components/auto_firebase_performance_events.tsx`, `server/{auth_user_server_provider,use_auth_user_server,resolve_optional_auth_user}.ts(x)`, `middleware/update_session.ts`, `src/firebase_auth_check/index.ts`
- Modify: `packages/cloudflare-next-intl/src/types/types.ts` (`export type { FirebaseAuthRoutingConfig, FirebaseAppCheckConfig, DeviceBindingConfig } from 'cloudflare-next-intl-auth/types'`; remove local definitions)
- Modify: `packages/cloudflare-next-intl/package.json` (`dependencies` add `"cloudflare-next-intl-auth": "file:../auth"`; drop `jose` if grep `rtk grep -rn "jose" packages/cloudflare-next-intl/src` finds no non-shim hit)
- Modify: `packages/cloudflare-next-intl/src/vite/optional_firebase_stub.ts` only if Test below fails
- Modify: `packages/cloudflare-next-intl/vitest.config.ts` (coverage exclude `src/firebase_auth/**`, `src/firebase_auth_check/**`; remove moved thresholds)
- Test: umbrella `config/middleware.test.ts`, `vite/optional_firebase_stub.test.ts`

**Interfaces:**
- Consumes: Task 2/3 exports. Umbrella composer files (`config/middleware.ts`, `client/components/client_extensions.tsx`, `server/components/server_provider*.tsx`, `errors_board/server/gate.ts`, `db/resolve_db_config.ts`, `vite/firebase_auth_check_plugin.ts`) keep their existing relative imports — shims satisfy them.

- [ ] **Step 1: Failing tests**
  - `middleware.test.ts`: `"does not import update_session without firebaseAuth"` — `vi.doMock('../firebase_auth/middleware/update_session.js', factory)`; config without `firebaseAuth`; run middleware; `factory` call count 0.
  - `optional_firebase_stub.test.ts`: `"stubs firebase import from auth package path"` — plugin `resolveId('firebase/auth', '/x/node_modules/cloudflare-next-intl-auth/dist/src/firebase_auth/client/firebase_client.js')` returns the stub id when `firebaseAuth` unset.
- [ ] **Step 2: Run** — Expected: first PASS already or FAIL only on import path; second FAIL if stub matches importer by umbrella path.
- [ ] **Step 3: Implement** shims, types re-export, dependency, stub importer match (accept `cloudflare-next-intl-auth` path alongside the umbrella one).
- [ ] **Step 4: Run** `cd packages/cloudflare-next-intl && rtk npx tsc --noEmit && rtk npm test` — PASS, coverage thresholds met.
- [ ] **Step 5: Commit** — `refactor: umbrella re-exports cloudflare-next-intl-auth`

---

### Task 5: Docs, exports check, end-to-end

**Files:**
- Modify: `packages/auth/README.md`, `llms.txt` (setup = `firebaseAuth` block on `setIntlConfig`; content moved from `src/firebase_auth/README.md` + `src/firebase_auth_check/README.md`, which become one-line pointers)
- Modify: `.agent/.sub-rules/packages/firebase-auth.md` (paths → `packages/auth/src/firebase_auth/**`), `structure.md`, `packages.md`

- [ ] **Step 1: Run** `cd packages/auth && rtk npm run build && rtk npm run check:exports && rtk npm run check:size && rtk npm test` — all exit 0.
- [ ] **Step 2: Run** `cd example && rtk npm install && rtk npm ls cloudflare-next-intl-intl cloudflare-next-intl-auth && rtk npm run build && rtk npm run preview` — one instance of each; sign up, sign in, reload a protected page (SSR user present), sign out (`__session` cleared), Turnstile App Check exchange succeeds, wrong password shows localized error.
- [ ] **Step 3: Run** `cd packages/cloudflare-next-intl && rtk npm run check:exports` — key list identical to `main`.
- [ ] **Step 4: Release** — publish `cloudflare-next-intl-auth@0.1.0`; swap umbrella `file:../auth` → `^0.1.0`; bump umbrella minor; CHANGELOGs. Commit — `chore(release): auth 0.1.0`.
