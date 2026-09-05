# Fix vinext optimistic-routing patch mismatch and stale Vite dep cache

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two of the four `cfni:vinext-route-wiring-fix` Vite-plugin patches (in `package/src/vite/vinext_route_wiring_fix.ts`, consumed by `clarivant/CRV`) were reported "fixed and verified" in an earlier session but are not actually taking effect against the real, installed `vinext` package in `clarivant/CRV/node_modules/vinext`. This plan fixes both causes and proves the fix with the existing Playwright script, not with source-reading claims.

**Architecture:** No architectural change. Task 1 corrects a regex/replacement pair in `patchOptimisticRouting` so it matches the actual shape of `matchOptimisticRouteManifestRoute` in the installed `vinext` version (confirmed by reading the real file — see Root Cause A). Task 2 adds a small cache-busting step to the plugin's `configResolved` hook so a successful on-disk patch also invalidates Vite's `optimizeDeps` cache, which was independently confirmed to be serving pre-patch code to the browser (see Root Cause B). Task 3 rebuilds the package, re-syncs it into `clarivant/CRV/node_modules/cloudflare-next-intl`, clears that repo's stale Vite cache, restarts its dev server, and runs `clarivant/CRV/scripts/test_loading_transition.mjs` for real pass/fail evidence.

**Tech Stack:** TypeScript, Vite plugin API (`configResolved`/`transform` hooks), Vitest, Playwright (validation script already in the consumer repo).

**Spec:** None — no separate spec document exists for this fix. The Global Constraints below capture the requirements, derived from live diagnosis performed in this session (see Root Cause A/B), and are the binding authority this plan argues from.

## Root Cause A — `patchOptimisticRouting`'s regex never matched the installed vinext version

`clarivant/CRV/node_modules/vinext/dist/server/app-optimistic-routing.js` currently contains:

```js
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const match = matchNode(getRouteTrie(options.routeManifest), urlParts.normalized, 0, []);
	if (match === null) return null;
	decodeMatchedParams(match.params);
	return match;
}
```

`MATCH_OPTIMISTIC_ROUTE_RE` in `vinext_route_wiring_fix.ts` requires a separate `const trie = getRouteTrie(...)` statement and an `if (match !== null) { ...; return match; } return null;` tail — neither is present here (the trie is inlined into the `matchNode(...)` call, and the function early-returns on `null` instead). The regex's `.test()` returns `false`, so `patchOptimisticRouting` silently returns the input unchanged. Confirmed directly:

```
$ node -e "import('./dist/src/vite/vinext_route_wiring_fix.js').then(m => {
  const fs = require('fs');
  const content = fs.readFileSync('/Volumes/External/clarivant/CRV/node_modules/vinext/dist/server/app-optimistic-routing.js','utf8');
  console.log(m.isOptimisticRoutingAlreadyFixed(content), m.patchOptimisticRouting(content) !== content);
})"
false false
```

Net effect: a click-initiated navigation whose href carries a locale prefix (`/en/property-profile`) never matches the route trie optimistically (the trie's routes are keyed without the locale segment), so `createOptimisticRouteTemplate`/`resolveOptimisticNavigationPayload` return `null` and vinext falls straight through to the full RSC round-trip with no interim shell — this is the "Property Profile doesn't switch immediately" complaint. `resolveOptimisticNavigationParams` (the other half of the same original patch) uses a different regex that *does* still match, so it silently applied on its own — that partial, incoherent patch state is exactly the kind of thing Task 1's fixture test is meant to catch going forward.

## Root Cause B — Vite's `optimizeDeps` cache serves a pre-patch copy of `route-matching.js`

`clarivant/CRV/node_modules/.vite/deps/_metadata.json` and `.../deps_rsc/_metadata.json` both reference a shared chunk (`route-matching-Q08CV1EX.js` in `deps/`, `route-matching-DhVTxsql.js` in `deps_rsc/`) pulled in transitively by other optimized entries (`navigation-*.js`, `router-*.js`, etc. — themselves reachable even though `vite.config.ts` lists the bare `vinext` package under `optimizeDeps.exclude`, because these are resolved and bundled as deep sub-path imports, a distinct specifier from the excluded bare one). Confirmed directly:

```
$ grep -c hasLeadingLocaleParam node_modules/vinext/dist/routing/route-matching.js
4
$ grep -c hasLeadingLocaleParam node_modules/.vite/deps/route-matching-Q08CV1EX.js
0
$ grep -c hasLeadingLocaleParam node_modules/.vite/deps_rsc/route-matching-DhVTxsql.js
0
```

The on-disk source is patched; the chunk the browser and RSC runtime actually execute is not, and was never invalidated after `syncPatchVinextOnDisk` last wrote to `route-matching.js` — Vite's `optimizeDeps` cache is keyed off a config/lockfile hash, not the byte content of files the plugin rewrites out-of-band, so a same-session or same-install patch does not by itself trigger a re-bundle. This is the "Property Details page shows the Home page's loading.tsx" complaint reappearing: the live back/forward locale-stripping fix (Issue 2 from the master bug prompt) is real on disk but not in the code path that runs.

## Global Constraints

- Every existing test in `package/src/vite/vinext_route_wiring_fix.test.ts` must keep passing unmodified — this plan only adds tests and fixes bugs, it does not change already-correct behavior (Issue 1 / route wiring, the route-matching locale strip, and the prefetch-learning fix are all confirmed still correctly applying on disk in `clarivant/CRV` and are out of scope for a behavior change).
- `patchOptimisticRouting`'s fixture test must be built from the **actual** current content of `clarivant/CRV/node_modules/vinext/dist/server/app-optimistic-routing.js` (paste the real function bodies into the test file), not a re-guess at vinext's shape — that discipline is what this plan exists to introduce, precisely because the opposite produced the bug in Root Cause A.
- The cache-busting step only runs when `syncPatchVinextOnDisk` reports it actually changed a file this run (`changed === true`). Do not unconditionally wipe `optimizeDeps` caches on every dev-server boot — that would force a full re-optimize on every `npm run dev`, a real ongoing cost for a fix that should be a one-time event per patch change.
- Do not touch `package/src/server/components/link.tsx` or its test file in this plan — the earlier session's viewport-prefetch change there was reverted because it broke navigation; it is unrelated to Root Cause A/B and out of scope here.
- Task 3's validation is not optional and is not satisfied by re-reading source: `clarivant/CRV/scripts/test_loading_transition.mjs` must be run against a live, freshly restarted dev server and its process must exit 0 (`TEST RESULT: PASSED!`) before this plan is considered complete. If it fails, the failure output is diagnostic input for further fixes in Task 3, not something to explain away.
- Every task ends with a local commit in `package/` (the `clarivant/CRV` side has no plan-owned commits — Task 3 only rebuilds/resyncs/validates there). Do not push.

---

### Task 1: Fix `patchOptimisticRouting`'s regex to match the installed vinext shape

**Files:**
- Modify: `package/src/vite/vinext_route_wiring_fix.ts` (the `MATCH_OPTIMISTIC_ROUTE_RE` / `FIXED_MATCH_OPTIMISTIC_ROUTE` pair, lines ~156-180)
- Modify: `package/src/vite/vinext_route_wiring_fix.test.ts` (add a fixture test using the real installed shape)
- Modify: `package/CHANGELOG.md` (new patch version entry — bump `package/package.json` version too)

**Interfaces:**
- No new exports. `patchOptimisticRouting(code: string): string` and `isOptimisticRoutingAlreadyFixed(code: string): boolean` keep their existing signatures.
- Consumes: nothing from another task.
- Produces: a `patchOptimisticRouting` that actually rewrites the real installed `app-optimistic-routing.js`. Task 3 depends on this taking effect after rebuild+resync.

- [ ] **Step 1: Write the failing fixture test using the real installed source**

  Add this test to `package/src/vite/vinext_route_wiring_fix.test.ts`, in the existing `describe("patchOptimisticRouting", ...)` block (find it via the existing tests around `MATCH_OPTIMISTIC_ROUTE_RE`/`resolveOptimisticNavigationParams`):

  ```ts
  // This fixture is copied verbatim from clarivant/CRV's installed
  // node_modules/vinext/dist/server/app-optimistic-routing.js — an early
  // regex/replacement pair matched a DIFFERENT shape (a separate `const
  // trie = getRouteTrie(...)` statement and an `if (match !== null) {...}
  // return null;` tail) and silently no-opped against this real shape
  // (inlined trie lookup, early-return on null). Keep this fixture in sync
  // with the real file if vinext's shape changes again — a synthetic
  // guess at the shape is exactly what caused the original miss.
  const REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE = `
  function matchOptimisticRouteManifestRoute(options) {
  	const urlParts = hrefToRouteParts(options.href, options.basePath);
  	if (urlParts === null) return null;
  	const match = matchNode(getRouteTrie(options.routeManifest), urlParts.normalized, 0, []);
  	if (match === null) return null;
  	decodeMatchedParams(match.params);
  	return match;
  }
  `;

  it("patches the real installed vinext shape (inlined trie lookup, early-return on null)", () => {
      expect(isOptimisticRoutingAlreadyFixed(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE)).toBe(false);

      const patched = patchOptimisticRouting(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE);

      expect(patched).not.toBe(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE);
      expect(patched).toContain("hasLeadingLocaleParam");
      expect(patched).toContain("getActiveRouteLocale");
      expect(isOptimisticRoutingAlreadyFixed(patched)).toBe(true);

      // Idempotent
      expect(patchOptimisticRouting(patched)).toBe(patched);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd package && npx vitest run src/vite/vinext_route_wiring_fix.test.ts -t "real installed vinext shape"`
  Expected: FAIL — `expect(patched).not.toBe(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE)` fails because `patchOptimisticRouting` returns the input unchanged (this is Root Cause A reproduced as a unit test).

- [ ] **Step 3: Replace the regex/replacement pair to cover both shapes**

  In `package/src/vite/vinext_route_wiring_fix.ts`, replace the existing `MATCH_OPTIMISTIC_ROUTE_RE` and `FIXED_MATCH_OPTIMISTIC_ROUTE` (the two `const` declarations directly above `const RESOLVE_OPTIMISTIC_NAV_PARAMS_RE`) with:

  ```ts
  const MATCH_OPTIMISTIC_ROUTE_RE =
      /function\s+matchOptimisticRouteManifestRoute\s*\(\s*options\s*\)\s*\{[\s\S]*?getRouteTrie\([\s\S]*?\)[\s\S]*?\n\}/;

  const FIXED_MATCH_OPTIMISTIC_ROUTE = `function matchOptimisticRouteManifestRoute(options) {
  	const urlParts = hrefToRouteParts(options.href, options.basePath);
  	if (urlParts === null) return null;
  	const trie = getRouteTrie(options.routeManifest);
  	const hasLeadingLocaleParam = Array.from(options.routeManifest?.segmentGraph?.routes?.values() ?? []).some((r) => r.patternParts?.[0] === ":locale");
  	if (hasLeadingLocaleParam) {
  		const activeLocale = (typeof document !== "undefined" && (document.documentElement?.lang || document.cookie.match(/__user_locale_key__=([^;]+)/)?.[1])) || (typeof window !== "undefined" && window.__VINEXT_LOCALE__) || "en";
  		if (urlParts.normalized[0] !== activeLocale) {
  			const localeMatch = matchNode(trie, [activeLocale, ...urlParts.normalized], 0, []);
  			if (localeMatch !== null) {
  				decodeMatchedParams(localeMatch.params);
  				return localeMatch;
  			}
  		}
  	}
  	const match = matchNode(trie, urlParts.normalized, 0, []);
  	if (match !== null) {
  		decodeMatchedParams(match.params);
  		return match;
  	}
  	return null;
  }`;
  ```

  This regex is deliberately loose (matches from the function's opening brace through the first `getRouteTrie(...)` call to the function's closing `\n}`) so it covers both the old separate-`trie`-variable shape the original patch targeted AND the real inlined-call shape found in Root Cause A — either way, the whole function body up to its own closing brace is replaced wholesale with the fixed version, so pre-existing content inside the matched span never survives into the output. Do not narrow this regex back down to one specific shape.

- [ ] **Step 4: Run the new test and the full existing suite to verify everything passes**

  Run: `cd package && npx vitest run src/vite/vinext_route_wiring_fix.test.ts`
  Expected: PASS — all tests in this file, including every pre-existing `describe("patchOptimisticRouting", ...)` / `describe("isOptimisticRoutingAlreadyFixed", ...)` case (which exercised the old separate-`trie`-variable shape) and the new fixture test from Step 1.

  Run: `cd package && npx vitest run`
  Expected: PASS — full package suite, 0 failures (this file's tests plus everything else, unaffected by this change).

- [ ] **Step 5: Bump version and changelog**

  In `package/package.json`, bump the `version` field's patch number by one from its current value.

  In `package/CHANGELOG.md`, add a new entry above the most recent one, in the file's existing format, e.g.:

  ```markdown
  ## [x.y.z]

  - Fix: `vinextRouteWiringFixPlugin`'s optimistic-routing patch (`patchOptimisticRouting`) now matches vinext's actual installed `matchOptimisticRouteManifestRoute` shape (inlined `getRouteTrie(...)` call, early-return on `null`) — the previous regex only matched a shape with a separate `const trie = ...` statement and silently no-opped against the real one, so the locale-prefix fix for optimistic (click-time) route matching never took effect.
  ```

  (Replace `x.y.z` with the version bumped to above; check `package/CHANGELOG.md`'s top entries for the exact heading/bullet style already in use and match it.)

- [ ] **Step 6: Commit**

  ```bash
  cd package
  git add src/vite/vinext_route_wiring_fix.ts src/vite/vinext_route_wiring_fix.test.ts package.json CHANGELOG.md
  git commit -m "fix: patchOptimisticRouting regex now matches vinext's real installed shape"
  ```

---

### Task 2: Bust Vite's `optimizeDeps` cache when a vinext patch actually changes a file

**Files:**
- Modify: `package/src/vite/vinext_route_wiring_fix.ts` (add `bustVinextOptimizeDepsCache`, call it from `vinextRouteWiringFixPlugin`'s `configResolved`)
- Modify: `package/src/vite/vinext_route_wiring_fix.test.ts` (add tests for the new function and its plugin wiring)
- Modify: `package/CHANGELOG.md` (append to the same entry from Task 1, or add a new one — see Step 5)

**Interfaces:**
- Consumes: `syncPatchVinextOnDisk`'s existing `boolean` return value (already produced by Task-1-unrelated code — no change to that function's signature).
- Produces: `export function bustVinextOptimizeDepsCache(cacheDir: string): boolean` — new export. Returns `true` if it removed at least one of `deps`/`deps_ssr`/`deps_rsc` under `cacheDir`, `false` otherwise (nothing existed, or `cacheDir` doesn't exist). Task 3 relies on this running as part of the plugin's `configResolved` hook — no direct call needed from Task 3, just confirm it fires (via the log line added in Step 2).

- [ ] **Step 1: Write the failing test**

  Add this to `package/src/vite/vinext_route_wiring_fix.test.ts` (new `describe` block, alongside the existing `describe("syncPatchVinextOnDisk & resolveVinextAppPageRouteWiringPath", ...)` block — reuse its `mkdtempSync`/`mkdirSync`/`writeFileSync`/`rmSync` imports, already present at the top of that block):

  ```ts
  describe("bustVinextOptimizeDepsCache", () => {
      let cacheTempDir: string;

      beforeEach(() => {
          cacheTempDir = mkdtempSync(join(tmpdir(), "cfni-vite-cache-"));
      });

      afterEach(() => {
          try {
              rmSync(cacheTempDir, { recursive: true, force: true });
          } catch {
              // Ignore
          }
      });

      it("removes deps, deps_ssr, and deps_rsc when present, and returns true", () => {
          for (const sub of ["deps", "deps_ssr", "deps_rsc"]) {
              const dir = join(cacheTempDir, sub);
              mkdirSync(dir, { recursive: true });
              writeFileSync(join(dir, "route-matching-ABC123.js"), "stale content", "utf8");
          }

          const result = bustVinextOptimizeDepsCache(cacheTempDir);

          expect(result).toBe(true);
          expect(existsSync(join(cacheTempDir, "deps"))).toBe(false);
          expect(existsSync(join(cacheTempDir, "deps_ssr"))).toBe(false);
          expect(existsSync(join(cacheTempDir, "deps_rsc"))).toBe(false);
      });

      it("removes only the subdirectories that exist", () => {
          mkdirSync(join(cacheTempDir, "deps"), { recursive: true });
          writeFileSync(join(cacheTempDir, "deps", "entry.js"), "x", "utf8");

          const result = bustVinextOptimizeDepsCache(cacheTempDir);

          expect(result).toBe(true);
          expect(existsSync(join(cacheTempDir, "deps"))).toBe(false);
      });

      it("returns false and does not throw when the cache dir has none of the subdirectories", () => {
          expect(() => bustVinextOptimizeDepsCache(cacheTempDir)).not.toThrow();
          expect(bustVinextOptimizeDepsCache(cacheTempDir)).toBe(false);
      });

      it("returns false and does not throw when cacheDir itself does not exist", () => {
          const missing = join(cacheTempDir, "does-not-exist");
          expect(() => bustVinextOptimizeDepsCache(missing)).not.toThrow();
          expect(bustVinextOptimizeDepsCache(missing)).toBe(false);
      });
  });
  ```

  Add `existsSync` to the existing `import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";` line in this test file (it currently lacks `existsSync`), and add `bustVinextOptimizeDepsCache` to the named imports from `"./vinext_route_wiring_fix.js"` at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd package && npx vitest run src/vite/vinext_route_wiring_fix.test.ts -t "bustVinextOptimizeDepsCache"`
  Expected: FAIL with `ReferenceError: bustVinextOptimizeDepsCache is not defined` (or a TypeScript import error) — the function doesn't exist yet.

- [ ] **Step 3: Implement `bustVinextOptimizeDepsCache` and wire it into the plugin**

  In `package/src/vite/vinext_route_wiring_fix.ts`, add this function directly after `syncPatchVinextOnDisk` (before `export interface VinextRouteWiringFixPluginOptions`):

  ```ts
  /**
   * Removes Vite's `optimizeDeps` pre-bundle caches (`deps`, `deps_ssr`,
   * `deps_rsc`) under `cacheDir`. Vite's optimizer keys its cache off a
   * config/lockfile hash, not the byte content of files a plugin rewrites
   * out-of-band — patching `vinext`'s source on disk (via
   * `syncPatchVinextOnDisk`) does NOT by itself invalidate an
   * already-built pre-bundle. Confirmed live: `route-matching.js` is
   * pulled into a shared chunk by other optimized vinext entries (its
   * client-side shims import it as a deep sub-path, a different specifier
   * from the bare `"vinext"` package excluded in a consumer's
   * `optimizeDeps.exclude`), so a patch applied after that chunk was built
   * silently never reaches the browser or RSC runtime until the cache is
   * cleared and Vite re-bundles from the patched source.
   *
   * Call this ONLY when a patch actually changed a file this run (see
   * `syncPatchVinextOnDisk`'s return value) — unconditionally wiping these
   * directories on every dev-server boot forces a full re-optimize every
   * time, a real ongoing cost this function exists to avoid outside of an
   * actual patch event.
   */
  export function bustVinextOptimizeDepsCache(cacheDir: string): boolean {
      let removed = false;
      for (const sub of ["deps", "deps_ssr", "deps_rsc"]) {
          const dir = resolve(cacheDir, sub);
          if (!existsSync(dir)) continue;
          try {
              rmSync(dir, { recursive: true, force: true });
              removed = true;
          } catch {
              // Failed remove — leave it, next successful patch run retries
          }
      }
      return removed;
  }
  ```

  Add `existsSync` and `rmSync` to the existing `import { existsSync, readFileSync, writeFileSync } from "node:fs";` line at the top of the file.

  Then update `vinextRouteWiringFixPlugin`'s `configResolved` hook (currently `const root = config.root || process.cwd(); syncPatchVinextOnDisk(root, { routeWiring, routeMatching, optimisticRouting, prefetchLearning });`) to:

  ```ts
  configResolved(config) {
      const root = config.root || process.cwd();
      const changed = syncPatchVinextOnDisk(root, { routeWiring, routeMatching, optimisticRouting, prefetchLearning });
      if (changed) {
          const cacheDir = config.cacheDir || resolve(root, "node_modules/.vite");
          const busted = bustVinextOptimizeDepsCache(cacheDir);
          if (busted) {
              // eslint-disable-next-line no-console
              console.log("[cfni:vinext-route-wiring-fix] patched vinext on disk and cleared its stale Vite optimizeDeps cache — dependencies will re-bundle on next request.");
          }
      }
  },
  ```

- [ ] **Step 4: Run the new tests and the full suite to verify everything passes**

  Run: `cd package && npx vitest run src/vite/vinext_route_wiring_fix.test.ts`
  Expected: PASS — the 4 new `bustVinextOptimizeDepsCache` tests plus every pre-existing test in this file.

  Run: `cd package && npx vitest run`
  Expected: PASS — full package suite, 0 failures.

  Run: `cd package && npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 5: Update changelog**

  Append a second bullet to the same `CHANGELOG.md` entry added in Task 1 Step 5 (same version — this and Task 1 ship together):

  ```markdown
  - Fix: `vinextRouteWiringFixPlugin` now clears Vite's `optimizeDeps` cache (`deps`/`deps_ssr`/`deps_rsc` under `cacheDir`) whenever it actually patches a vinext file on disk — previously a patch could land in `node_modules/vinext` while the browser/RSC runtime kept executing an already-pre-bundled, pre-patch copy of the same code until the cache was cleared by some unrelated means.
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd package
  git add src/vite/vinext_route_wiring_fix.ts src/vite/vinext_route_wiring_fix.test.ts CHANGELOG.md
  git commit -m "fix: bust stale Vite optimizeDeps cache after patching vinext on disk"
  ```

---

### Task 3: Rebuild, resync into clarivant/CRV, and validate with the real Playwright script

**Files:**
- No new source files. This task runs commands against `package/` (build) and `clarivant/CRV/` (consumer install + validation) and, if `clarivant/CRV/scripts/test_loading_transition.mjs` surfaces a real remaining bug, records exactly what it found (this task does not silently declare success without that script's PASSED output).

**Interfaces:**
- Consumes: the rebuilt `package/dist` from Tasks 1-2 (specifically `dist/src/vite/vinext_route_wiring_fix.js`'s corrected `patchOptimisticRouting` and new `bustVinextOptimizeDepsCache`).
- Produces: nothing new later tasks build on — this is the plan's final validation gate.

- [ ] **Step 1: Build the package**

  Run: `cd package && npm run build`
  Expected: exits 0, `dist/` regenerated. Verify the two fixes landed in the built output:

  ```bash
  grep -c "getActiveRouteLocale\|hasLeadingLocaleParam" dist/src/vite/vinext_route_wiring_fix.js
  grep -c "bustVinextOptimizeDepsCache" dist/src/vite/vinext_route_wiring_fix.js
  ```

  Expected: both greater than 0.

- [ ] **Step 2: Resync the built package into clarivant/CRV's node_modules**

  `clarivant/CRV` does not currently consume this package via a symlink (an earlier `npm link` in this session broke its hoisted `drizzle-orm`/`@supabase/supabase-js` resolution and was reverted back to a plain `npm install`) — resync by copying the built `dist/` directly over the installed copy:

  ```bash
  rsync -a --delete /Volumes/External/own_projects/cloudflare-next-intl/package/dist/ /Volumes/External/clarivant/CRV/node_modules/cloudflare-next-intl/dist/
  ```

  Verify the copy landed:

  ```bash
  grep -c "getActiveRouteLocale\|hasLeadingLocaleParam" /Volumes/External/clarivant/CRV/node_modules/cloudflare-next-intl/dist/src/vite/vinext_route_wiring_fix.js
  grep -c "bustVinextOptimizeDepsCache" /Volumes/External/clarivant/CRV/node_modules/cloudflare-next-intl/dist/src/vite/vinext_route_wiring_fix.js
  ```

  Expected: both greater than 0.

- [ ] **Step 3: Verify the corrected patch now actually applies to the real installed vinext file**

  This directly re-runs the Root Cause A repro from this plan's header, expecting the opposite result now:

  ```bash
  cd /Volumes/External/own_projects/cloudflare-next-intl/package
  node -e "
  import('/Volumes/External/clarivant/CRV/node_modules/cloudflare-next-intl/dist/src/vite/vinext_route_wiring_fix.js').then(m => {
    const fs = require('fs');
    const path = '/Volumes/External/clarivant/CRV/node_modules/vinext/dist/server/app-optimistic-routing.js';
    const content = fs.readFileSync(path, 'utf8');
    console.log('alreadyFixed (before):', m.isOptimisticRoutingAlreadyFixed(content));
    const patched = m.patchOptimisticRouting(content);
    console.log('changed:', patched !== content);
    console.log('alreadyFixed (after):', m.isOptimisticRoutingAlreadyFixed(patched));
  });
  "
  ```

  Expected: `alreadyFixed (before): false`, `changed: true`, `alreadyFixed (after): true`. If this still prints `changed: false`, Task 1 did not actually fix the mismatch against this exact installed file — stop and re-diagnose Task 1 rather than proceeding.

- [ ] **Step 4: Stop the running dev server and clear clarivant/CRV's stale Vite cache**

  A dev server may already be running (check with `lsof -nP -iTCP:3000 -sTCP:LISTEN`). If one is running, stop it (its own terminal's Ctrl+C, or `kill <pid>` from the `lsof` output) — it holds the stale pre-bundled `route-matching.js` chunk in memory in addition to on disk, per Root Cause B, and a running process will not pick up a cache directory that's deleted out from under it.

  Then, since Task 2's cache-busting logic only fires from inside a running Vite process (`configResolved`), and this is the one occasion where the cache is known-stale from BEFORE that logic existed, clear it directly this one time:

  ```bash
  rm -rf /Volumes/External/clarivant/CRV/node_modules/.vite
  ```

  Confirm removal: `ls /Volumes/External/clarivant/CRV/node_modules/.vite 2>&1` should report "No such file or directory".

- [ ] **Step 5: Restart the dev server and confirm the plugin's on-disk patches actually took, including the newly-fixed one**

  ```bash
  cd /Volumes/External/clarivant/CRV
  NEXT_PUBLIC_FLAVOUR=staging NEXT_PUBLIC_SUB_FLAVOUR=homeowner npx vinext dev > /tmp/vinext-dev.log 2>&1 &
  ```

  Wait for it to report ready (poll `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` until it responds, or tail `/tmp/vinext-dev.log` for its ready line), then re-check all four patches against the on-disk vinext files it just started against:

  ```bash
  grep -c "hasLeadingLocaleParam" /Volumes/External/clarivant/CRV/node_modules/vinext/dist/server/app-optimistic-routing.js
  grep -c "hasLeadingLocaleParam" /Volumes/External/clarivant/CRV/node_modules/vinext/dist/routing/route-matching.js
  grep -c "deepestNestedEntry" /Volumes/External/clarivant/CRV/node_modules/vinext/dist/server/app-page-route-wiring.js
  grep -c "targetRscUrl" /Volumes/External/clarivant/CRV/node_modules/vinext/dist/server/app-browser-entry.js
  ```

  Expected: all four greater than 0 (the first one is the newly-fixed patch from Task 1 — this is the actual regression test for Root Cause A, run against the live server this plan will validate against).

  Once the server responds on port 3000, trigger the actual dependency scan (a normal page load or curl to `/`) and confirm the previously-stale chunk is gone and rebuilt clean:

  ```bash
  curl -s -o /dev/null http://localhost:3000/en
  sleep 2
  grep -rl "route-matching" /Volumes/External/clarivant/CRV/node_modules/.vite/deps*/  2>/dev/null | xargs -I{} sh -c 'echo {}: && grep -c hasLeadingLocaleParam {}'
  ```

  Expected: every matched chunk file now reports a `hasLeadingLocaleParam` count greater than 0 (Root Cause B resolved — if this still prints `0` for any file, the cache-bust from Task 2 did not run or did not cover the right directory; re-diagnose before proceeding).

- [ ] **Step 6: Run the existing Playwright validation script against the live server**

  ```bash
  cd /Volumes/External/clarivant/CRV
  node scripts/test_loading_transition.mjs
  ```

  Expected: exit code 0, final line `TEST RESULT: PASSED! 4/4 iterations transitioned cleanly with ZERO HomeSkeleton leaks.`

  This script only checks for HomeSkeleton leaking onto `/property-profile` and back-nav timing (Issues 1/2 from the master bug prompt) — it does not measure forward-nav (Home → Property Profile) click-to-skeleton latency, which is the specific first complaint in this session ("pages should switch immediately show first loading tsx for property details ... work for home page no"). If Step 3-5 confirm all four patches are live and this script still passes, but a manual click-through in a real browser (not headless) still shows a delay specifically on the Home → Property Profile direction, that is evidence of a **different**, not-yet-diagnosed cause (a candidate to investigate next: whether `/property-profile`'s own `loading.tsx` and its `PropertyIntakeSkeleton`/`PropertyAuditHistorySkeleton` children are staying synchronous — confirm with `grep -n "async function\|await " "src/app/\[locale\]/(app)/property-profile/loading.tsx"`, expecting zero matches, matching the fix already applied and reverted-then-reapplied earlier in this session) and is out of scope for this plan to fix blind; report it precisely rather than guessing at a fifth patch.

  If the script fails, capture its exact failure output (it prints the specific iteration and failure reason) — that output is the next diagnostic input, not a reason to mark this task done anyway.

- [ ] **Step 7: Report results**

  This step has no commit — it is the plan's completion gate. Produce a short factual report (for the final review, not user-facing chat) containing:
  - The exact output of Step 3's `changed: true/false` check.
  - The exact grep counts from Step 5.
  - The exact final two lines of Step 6's script output (PASSED or FAILED line, and the failure list if any).
  - If Step 6 failed: the script's per-iteration failure lines verbatim, and whether the failure pattern matches Root Cause A, Root Cause B, neither, or looks like the separate forward-nav-latency issue called out in Step 6.
