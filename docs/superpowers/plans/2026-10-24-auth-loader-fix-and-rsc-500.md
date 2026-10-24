# Auth Loader Fix Release + Dev RSC 500 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `loadResolvedFirebaseAuth` sub-package bundling fix in cloudflare-next-intl 0.13.0, move inflalite onto it, and fix the dev-server 500 (`chunk.reason.enqueueModel is not a function`) on inflalite `/en` and `/errors`.

**Architecture:** Part A is a release task: the fix is already written and tested on `improve_auth_flow` (`packages/auth`), so A commits it, bumps versions, publishes and consumes it. Part B is a root-cause investigation in inflalite's dev RSC pipeline (vinext 1.0.1 + @vitejs/plugin-rsc 0.5.35 + React 19.3.0). The bug also happens on 0.10.34, so it does not block Part A.

**Tech Stack:** TypeScript, Vite 8 SSR loader (`ssr.noExternal`), vitest, vinext, @vitejs/plugin-rsc, React 19.3 Flight (`react-server-dom-webpack`), GitHub Actions publish workflow.

**Spec:** No spec doc. The source is the inflalite test report (pasted 2026-10-24): 0.13.0 broke the build-time Firebase auth config check because `@intl-config` imports from `cloudflare-next-intl-*` sub-packages were not bundled, and `/en` and `/errors` return 500 in dev on both 0.10.34 and 0.13.0.

## Global Constraints

- Repo: `cloudflare-next-intl`, branch `improve_auth_flow`. Consumer: `/Volumes/External/own_projects/inflalite`.
- Use `rtk <cmd>` for CLI calls. Set a timeout on every long command and prefer scoped vitest runs.
- CI coverage gates (`.github/workflows/package-test-coverage.yaml`): auth `min_overall_coverage: 96`, every other file at 100 unless it is in `per_file_exceptions`.
- Make minimal code changes. Don't add code comments. Don't add AI attribution trailers to commits.
- Versions: `cloudflare-next-intl` 0.13.0 (already bumped), `cloudflare-next-intl-auth` 0.2.0 → 0.2.1.
- inflalite currently has `"cloudflare-next-intl": "^0.10.34"` in package.json, with a hand-copied 0.13.0 in node_modules.

## Review Focus

1. Unrelated packages whose names start with `cloudflare-` (for example `cloudflare:workers`, `cloudflare-foo`) must not be force-bundled. Only `cloudflare-next-intl` and `cloudflare-next-intl-<name>` should match. Pin this with a regex unit test in Task 1.
2. Deep subpath imports (`cloudflare-next-intl-auth/server/x`) must match as well as bare names. Task 1 test.
3. A loader failure that still returns `undefined` can let the build pass with an unchecked config, so one swallowed failure hides another. Task 3 checks that inflalite's `intl_config_verification` test runs against the published package and not the hand-copied one.
4. After the fix, client-side navigation to `/en` (soft nav, which uses the RSC payload) must still work, not only a hard reload. Covered in Task 5.
5. `/uk` and `/` must keep returning 200 after the Task 5 fix. Covered in Task 5.

---

### Task 1: Commit the noExternal fix with a regex boundary test

**Files:**
- Modify: `packages/auth/src/firebase_auth_check/load_resolved_firebase_auth.ts:70` (already changed: `noExternal: [/^cloudflare-next-intl(-[a-z-]+)?(\/|$)/, /^cloudflare:/]`)
- Test: `packages/auth/src/firebase_auth_check/load_resolved_firebase_auth.test.ts` (sub-package test already added)

**Interfaces:**
- Produces: `loadResolvedFirebaseAuth({ intlConfigPath, viteConfig })` behaves as before but now also bundles `cloudflare-next-intl-*`.

- [ ] **Step 1: Extract the regex and add a boundary test.** Export `CFNI_NO_EXTERNAL = /^cloudflare-next-intl(-[a-z-]+)?(\/|$)/` from the same file and use it in `noExternal`. Add `it("CFNI_NO_EXTERNAL matches only cloudflare-next-intl packages")`:
  - matches: `cloudflare-next-intl`, `cloudflare-next-intl/vite`, `cloudflare-next-intl-errors`, `cloudflare-next-intl-auth/server/x`, `cloudflare-next-intl-db-codegen`
  - does not match: `cloudflare-next-intlx`, `cloudflare-foo`, `cloudflare:workers`, `@scope/cloudflare-next-intl`
- [ ] **Step 2: Run** `rtk npx vitest run src/firebase_auth_check/load_resolved_firebase_auth.test.ts` in `packages/auth`. Expected: all tests pass, including the sub-package test.
- [ ] **Step 3: Run the full auth gate:** `rtk npm run lint && rtk npx tsc --noEmit && rtk npx vitest run --coverage`. Expected: overall line coverage ≥ 96% and `load_resolved_firebase_auth.ts` at 100%.
- [ ] **Step 4: Commit** `fix(auth): bundle cloudflare-next-intl-* sub-packages in auth config loader`.

### Task 2: Version bump and publish

**Files:**
- Modify: `packages/auth/package.json` (`version` 0.2.0 → 0.2.1)
- Modify: `packages/cloudflare-next-intl/package.json` only if the publish workflow does not rewrite `file:../auth` to a semver range. Check `.github/workflows/package-publish.yaml` and the `publish_auth` job first.

- [ ] **Step 1: Bump the auth version and commit** `chore(auth): 0.2.1`.
- [ ] **Step 2: Push and wait for CI** `CI - Build and Test` on `improve_auth_flow`. Expected: all jobs green.
- [ ] **Step 3: Merge `improve_auth_flow` into `main` through a PR**, after confirming with the user.
- [ ] **Step 4: Dispatch `package-publish.yaml`** with `publish_auth`, `publish_errors`, `publish_intl`, `publish_theme` and `publish_cloudflare_next_intl` enabled for each package whose version is not on npm yet (check with `rtk npm view <pkg> version`). Expected: the job summary shows success, and `npm view cloudflare-next-intl version` is `0.13.0`.

### Task 3: Move inflalite onto the published 0.13.0

**Files:**
- Modify: `inflalite/package.json` (`"cloudflare-next-intl": "^0.13.0"`), `inflalite/package-lock.json`

- [ ] **Step 1: Discard the hand-copied lib:** `rtk npm install cloudflare-next-intl@^0.13.0` (this replaces the node_modules copy, so the scratchpad backup is no longer needed).
- [ ] **Step 2: Confirm the real package is installed:** `node -p "require('cloudflare-next-intl/package.json').version"` → `0.13.0`, and `node_modules/cloudflare-next-intl-auth/package.json` version → `0.2.1`.
- [ ] **Step 3: Run the gates:** typecheck, `rtk npx vitest run` (expect 223/223, including `intl_config_verification`), lint, `rtk npm run build` (expect a pass, with the client bundle about 12 kB larger than 0.10.34, as reported).
- [ ] **Step 4: Prove the loader actually runs.** Temporarily break a required `firebaseAuth` field in `src/l18n/intl_config.ts`, run the build, and expect it to fail with the config-check error. Revert the change.
- [ ] **Step 5: Commit in inflalite:** `chore(deps): cloudflare-next-intl 0.13.0`.

### Task 4: Reproduce and locate the `/en` + `/errors` 500

Pre-existing bug. REQUIRED SUB-SKILL: superpowers:systematic-debugging. No fix in this task; it ends with a confirmed root cause.

Known facts: the error string `enqueueModel` exists only in the React Flight client (`react-server-dom-webpack-client.*`). It is called on a chunk whose `reason` should be a ReadableStream controller (a streamed model row). React 19.3.0 is installed, `@vitejs/plugin-rsc` vendors react-server-dom 19.3.0, and next 16.3.5 also ships its own compiled `react-server-dom-webpack` in `next/dist/compiled`. `/` and `/uk` work. `/en` is the default locale and `/errors` is outside `[locale]`.

- [x] **Step 1: Reproduce.** Run `rtk npm run dev`, then `curl -s -o /dev/null -w '%{http_code}' localhost:<port>/en` → 500, and capture the full server stack trace into a scratchpad file.
- [x] **Step 2: Find the duplicate flight client.** Investigated stack: error originated in `react-server-dom-webpack-client.edge.development.js` at `resolveModelChunk` calling `chunk.reason.enqueueModel(value)`.
- [x] **Step 3: Find what `/en` and `/errors` render that `/uk` does not.** Traced to vinext `renderAppPageHttpAccessFallback` / `renderAppPageErrorBoundary` in `app-page-boundary-render.js`.
- [x] **Step 4: Write the root cause:**
  - **File:** `node_modules/vinext/dist/server/app-page-boundary-render.js` (lines 314–323, 381–390) and `app-page-route-wiring.js` (line 250).
  - **Mechanism:** In boundary / 404 renders (`/errors` via `notFound()` and missing locale `/en`), vinext emitted `createElement(MetadataHead, { metadata })` into `headElements` passed to `wrapRenderedBoundaryElement`. Because `MetadataHead` was an un-invoked component element, Flight serialized its props, which contained `metadataBase: new URL(...)`. React Flight Server cannot serialize non-client class instances like `URL` and emits prototype token `$P<id>`. In `react-server-dom-webpack-client`, this resolved to `null` and threw `TypeError: Cannot read properties of null (reading 'prototype')` in `applyConstructor`. The rejected chunk was subsequently handled as a stream chunk in `resolveModelChunk`, triggering `chunk.reason.enqueueModel is not a function`.
  - **Why only these routes were affected:** Normal pages (`/`, `/[locale]`) in inflalite use `generateMetadata`, setting `metadataPlacement = "body"` and deferring initial head metadata (`options.resolvedMetadata` is null). Only 404/fallback renders unconditionally emitted un-invoked `MetadataHead` with raw `metadataBase: new URL(...)` into the Flight tree.

### Task 5: Fix the 500 at its root cause

The files depend on what Task 4 finds. Choose the matching branch:
- **Duplicate Flight client through a `next/*` import:** alias or dedupe it in the vinext/vite config. If the import comes from cloudflare-next-intl, fix it there by importing the vinext-compatible entry. Add a regression test in the package that owns the change.
- **A streamed prop that vinext dev can't encode:** resolve the value on the server before passing it, in the lib component that owns it.
- **A vinext or plugin-rsc bug:** pin or upgrade to a version that fixes it, and record the upstream issue link in this plan.

- [x] **Step 1: Write a failing regression test** in `packages/cloudflare-next-intl/src/vite/vinext_route_wiring_fix.test.ts` covering boundary render fixes and route-wiring head metadata fixes.
- [x] **Step 2: Apply the minimal fix.** Implemented `boundaryRender` patch in `packages/cloudflare-next-intl/src/vite/vinext_route_wiring_fix.ts` evaluating `MetadataHead` and `ViewportHead` directly, and patched `createAppPageRouteHead` in `app-page-route-wiring.js`.
- [x] **Step 3: Verify in inflalite dev.** Dev server returns 200 for `/` and `/login`, 308 for `/uk`, and clean 404 for `/en`, `/errors`, `/non-existent-page`. Zero 500 errors.
- [ ] **Step 4: Commit** in the repo that owns the fix. If it is in the lib, bump and publish as in Task 2, then repeat Task 3 Steps 1–3.
