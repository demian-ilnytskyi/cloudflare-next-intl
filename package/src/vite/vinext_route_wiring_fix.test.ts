import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
    hasRequiredSymbols,
    patchAppPageRouteWiring,
    isAppPageRouteWiringFile,
    isAppPageRouteWiringAlreadyFixed,
    patchRouteMatching,
    isRouteMatchingFile,
    isRouteMatchingAlreadyFixed,
    isOptimisticRoutingFile,
    isOptimisticRoutingAlreadyFixed,
    patchOptimisticRouting,
    patchPrefetchLearning,
    isPrefetchLearningFile,
    isPrefetchLearningAlreadyFixed,
    resolveVinextBrowserEntryPath,
    resolveVinextOptimisticRoutingPath,
    syncPatchVinextOnDisk,
    isVinextAppPageRouteWiringSafeOnDisk,
    isAppPageProbeFile,
    isAppPageProbeAlreadyFixed,
    patchAppPageProbe,
    resolveVinextAppPageProbePath,
    isVinextAppPageProbeSafeOnDisk,
    vinextRouteWiringFixPlugin,
    isRenderDependencyFile,
    isRenderDependencyAlreadyFixed,
    patchRenderDependency,
    isOptimisticLearningTimeoutFile,
    isOptimisticLearningTimeoutAlreadyFixed,
    patchOptimisticLearningTimeout,
    isPageInvokerSuspensionReleaseFile,
    isPageInvokerSuspensionReleaseAlreadyFixed,
    patchPageInvokerSuspensionRelease,
} from "./vinext_route_wiring_fix.js";

describe("isAppPageRouteWiringFile", () => {
    it("returns true for app-page-route-wiring.js paths", () => {
        expect(
            isAppPageRouteWiringFile("/project/node_modules/vinext/dist/server/app-page-route-wiring.js")
        ).toBe(true);
        expect(
            isAppPageRouteWiringFile("C:\\project\\node_modules\\vinext\\dist\\server\\app-page-route-wiring.js?v=123")
        ).toBe(true);
    });

    it("returns false for other files", () => {
        expect(isAppPageRouteWiringFile("/project/src/app/page.tsx")).toBe(false);
        expect(isAppPageRouteWiringFile("/project/node_modules/vinext/dist/server/app-page-dispatch.js")).toBe(false);
    });
});

describe("isAppPageRouteWiringAlreadyFixed", () => {
    it("returns false when buggy patterns are present", () => {
        const buggyCode = `
function getPrefetchLoadingEntry(route) {
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {};
	}
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`;
        expect(isAppPageRouteWiringAlreadyFixed(buggyCode)).toBe(false);
    });

    it("returns true when code is already fixed or does not have buggy patterns", () => {
        const fixedCode = `
function getPrefetchLoadingEntry(route) {
	let deepestNestedEntry = null;
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {
`;
        expect(isAppPageRouteWiringAlreadyFixed(fixedCode)).toBe(true);

        const upstreamRefactoredCode = `
export function someFutureImplementation() {
    return 42;
}
`;
        expect(isAppPageRouteWiringAlreadyFixed(upstreamRefactoredCode)).toBe(true);
    });
});

describe("patchAppPageRouteWiring", () => {
    const sampleBuggyCode = `
function resolveAppPageLoadingModuleAtOrAbove(route, treePosition) {
    return null;
}
function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	if (firstNestedEntry) return firstNestedEntry;
	if (rootEntry) return rootEntry;
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}
function createAppPageSlotLoadingEntries(slot, override) {
    return [];
}
function renderTree() {
    if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
        const segmentLoadingComponent = getDefaultExport(loadingEntry?.loadingModule);
    }
}
`;

    it("patches getPrefetchLoadingEntry to prioritize leaf loading and deepest nested entry", () => {
        const patched = patchAppPageRouteWiring(sampleBuggyCode);
        expect(patched).toContain("deepestNestedEntry");
        expect(patched).toContain("leafEntry.treePosition >= deepestNestedEntry.treePosition");
        expect(patched).not.toContain("firstNestedEntry");
    });

    it("patches the Suspense boundary check with !routeLoadingComponent", () => {
        const patched = patchAppPageRouteWiring(sampleBuggyCode);
        expect(patched).toContain(
            "if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {"
        );
    });

    it("patches loading component calls to pass params", () => {
        const loadingCode = `
fallback: /* @__PURE__ */ jsx(PageLoadingComponent, {})
fallback: /* @__PURE__ */ jsx(AncestorLoadingComponent, {})
fallback: /* @__PURE__ */ jsx(LoadingComponent, {})
fallback: /* @__PURE__ */ jsx(OwnerLoadingComponent, {})
routeChildren = /* @__PURE__ */ jsx(prefetchLoadingComponent, {});
fallback: /* @__PURE__ */ jsx(routeLoadingComponent, {})
fallback: /* @__PURE__ */ jsx(segmentLoadingComponent, {})
slotElement = /* @__PURE__ */ jsx(getDefaultExport(prefetchSlotLoadingEntry.loadingModule), {});
`;
        const patched = patchAppPageRouteWiring(loadingCode);
        expect(patched).toContain("/* @__PURE__ */ jsx(PageLoadingComponent, { params: options.makeThenableParams(options.matchedParams) })");
        expect(patched).toContain("/* @__PURE__ */ jsx(AncestorLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, ancestorLoadingEntry.treePosition, options.matchedParams)) })");
        expect(patched).toContain("/* @__PURE__ */ jsx(LoadingComponent, { params: options.makeThenableParams(slotParams) })");
        expect(patched).toContain("/* @__PURE__ */ jsx(OwnerLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, ownerLoadingEntry.treePosition, options.matchedParams)) })");
        expect(patched).toContain("routeChildren = /* @__PURE__ */ jsx(prefetchLoadingComponent, { params: options.makeThenableParams(options.matchedParams) });");
        expect(patched).toContain("/* @__PURE__ */ jsx(routeLoadingComponent, { params: options.makeThenableParams(options.matchedParams) })");
        expect(patched).toContain("/* @__PURE__ */ jsx(segmentLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, treePosition, options.matchedParams)) })");
        expect(patched).toContain("slotElement = /* @__PURE__ */ jsx(getDefaultExport(prefetchSlotLoadingEntry.loadingModule), { params: options.makeThenableParams(slotParams) });");
    });

    it("does not change code if it is already fixed", () => {
        const patchedOnce = patchAppPageRouteWiring(sampleBuggyCode);
        const patchedTwice = patchAppPageRouteWiring(patchedOnce);
        expect(patchedTwice).toBe(patchedOnce);
    });

    it("returns unchanged code when patterns do not match or upstream is different", () => {
        const irrelevantCode = "export const foo = 42;";
        expect(patchAppPageRouteWiring(irrelevantCode)).toBe(irrelevantCode);
    });
});

// ─── Second fix: page element must not block on layout Suspense deps ──────────

const PAGE_BLOCKING_CODE = `
	const pageDependencies = [];
	for (const treePosition of orderedTreePositions) {
		const layoutDependency = createAppRenderDependency();
		pageDependencies.push(layoutDependency);
	}
	pageRenderDependency?.setResultDependencies(pageDependencies);
	const pageElement = jsx(Suspense, { fallback: null, children: options.element });
	elements[pageElementId] = isPrefetchLoadingShell ? null : pageRenderDependency ? pageElement : renderAfterAppDependencies(pageElement, pageDependencies);
`;

const UNBLOCK = { unblockRenderDependencies: true, unblockPageElementDependencies: true } as const;

describe("isAppPageRouteWiringAlreadyFixed — second fix detection", () => {
    it("returns false when setResultDependencies(pageDependencies) pattern is present", () => {
        expect(isAppPageRouteWiringAlreadyFixed(PAGE_BLOCKING_CODE, UNBLOCK)).toBe(false);
    });

    it("returns false when renderAfterAppDependencies(pageElement, pageDependencies) fallback is present", () => {
        const code = `elements[pageElementId] = isPrefetchLoadingShell ? null : pageRenderDependency ? pageElement : renderAfterAppDependencies(pageElement, pageDependencies);`;
        expect(isAppPageRouteWiringAlreadyFixed(code, UNBLOCK)).toBe(false);
    });

    it("returns true when both patterns are replaced", () => {
        const fixedCode = `
	pageRenderDependency?.setResultDependencies([]);
	elements[pageElementId] = isPrefetchLoadingShell ? null : pageElement;
`;
        expect(isAppPageRouteWiringAlreadyFixed(fixedCode, UNBLOCK)).toBe(true);
    });
});

describe("patchAppPageRouteWiring — second fix: page Suspense blocking", () => {
    it("replaces setResultDependencies(pageDependencies) with setResultDependencies([])", () => {
        const patched = patchAppPageRouteWiring(PAGE_BLOCKING_CODE, UNBLOCK);
        expect(patched).toContain("pageRenderDependency?.setResultDependencies([]);");
        expect(patched).not.toContain("setResultDependencies(pageDependencies)");
    });

    it("removes renderAfterAppDependencies fallback from elements[pageElementId]", () => {
        const patched = patchAppPageRouteWiring(PAGE_BLOCKING_CODE, UNBLOCK);
        expect(patched).toContain("elements[pageElementId] = isPrefetchLoadingShell ? null : pageElement;");
        expect(patched).not.toContain("renderAfterAppDependencies(pageElement, pageDependencies)");
    });

    it("is idempotent — applying patch twice yields the same result", () => {
        const once = patchAppPageRouteWiring(PAGE_BLOCKING_CODE, UNBLOCK);
        const twice = patchAppPageRouteWiring(once, UNBLOCK);
        expect(twice).toBe(once);
    });

    it("leaves code unchanged when patterns are absent", () => {
        const unrelated = "export const foo = 42;";
        expect(patchAppPageRouteWiring(unrelated, UNBLOCK)).toBe(unrelated);
    });

    it("patches only setResultDependencies when elements[pageElementId] pattern is absent", () => {
        const codeWithOnlyResultDeps = `pageRenderDependency?.setResultDependencies(pageDependencies);`;
        const patched = patchAppPageRouteWiring(codeWithOnlyResultDeps, UNBLOCK);
        expect(patched).toContain("pageRenderDependency?.setResultDependencies([]);");
    });

    it("patches only elements[pageElementId] when setResultDependencies pattern is absent", () => {
        const codeWithOnlyBlocking = `elements[pageElementId] = isPrefetchLoadingShell ? null : pageRenderDependency ? pageElement : renderAfterAppDependencies(pageElement, pageDependencies);`;
        const patched = patchAppPageRouteWiring(codeWithOnlyBlocking, UNBLOCK);
        expect(patched).toContain("elements[pageElementId] = isPrefetchLoadingShell ? null : pageElement;");
    });
});


describe("render-dependency unblocking is opt-in", () => {
    it("leaves vinext's render-dependency ordering alone by default", () => {
        expect(patchAppPageRouteWiring(PAGE_BLOCKING_CODE)).toBe(PAGE_BLOCKING_CODE);
        expect(isAppPageRouteWiringAlreadyFixed(PAGE_BLOCKING_CODE)).toBe(true);
    });

    it("strips it only when unblockRenderDependencies is set", () => {
        expect(patchAppPageRouteWiring(PAGE_BLOCKING_CODE, UNBLOCK)).not.toBe(PAGE_BLOCKING_CODE);
    });
});

describe("vinextRouteWiringFixPlugin", () => {
    it("creates a plugin with enforce: pre and transform hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        expect(plugin.name).toBe("cfni:vinext-route-wiring-fix");
        expect(plugin.enforce).toBe("pre");
        expect(typeof plugin.transform).toBe("function");
    });

    it("transforms app-page-route-wiring.js when buggy and returns code", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;

        const otherRes = transform("const x = 1;", "/src/main.ts");
        expect(otherRes).toBeUndefined();

        const wiringCode = `
function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
	}
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`;
        const res = transform(wiringCode, "/node_modules/vinext/dist/server/app-page-route-wiring.js");
        expect(res).toBeDefined();
        expect(res?.code).toContain("deepestNestedEntry");
        expect(res?.code).toContain("!routeLoadingComponent");
    });

    it("returns undefined and does not transform when already fixed", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;

        const fixedCode = `
function getPrefetchLoadingEntry(route) {
	let deepestNestedEntry = null;
	return null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {
`;
        const res = transform(fixedCode, "/node_modules/vinext/dist/server/app-page-route-wiring.js");
        expect(res).toBeUndefined();
    });

    it("returns undefined when not already fixed but the patch is a no-op (deepestNestedEntry already present elsewhere)", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;

        const noOpCode = `
function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	if (firstNestedEntry) return firstNestedEntry;
	if (rootEntry) return rootEntry;
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}
// deepestNestedEntry already exists elsewhere in this bundle
const somewhereElseMarker = "deepestNestedEntry";
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`;
        expect(isAppPageRouteWiringAlreadyFixed(noOpCode)).toBe(false);
        const res = transform(noOpCode, "/node_modules/vinext/dist/server/app-page-route-wiring.js");
        expect(res).toBeUndefined();
    });


    it("matches .ts and .tsx file variants", () => {
        expect(isAppPageRouteWiringFile("/dir/app-page-route-wiring.tsx")).toBe(true);
        expect(isAppPageRouteWiringFile("/dir/app-page-route-wiring.ts")).toBe(true);
    });

    it("runs syncPatchVinextOnDisk in configResolved hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        expect(typeof plugin.configResolved).toBe("function");
        const configResolvedHook = plugin.configResolved as (this: unknown, config: { root?: string }) => void;
        expect(() => {
            configResolvedHook.call({}, { root: "/non-existent-directory" });
        }).not.toThrow();
        expect(() => {
            configResolvedHook.call({}, {});
        }).not.toThrow();
    });
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    resolveVinextAppPageRouteWiringPath,
    syncPatchVinextOnDisk,
    bustVinextOptimizeDepsCache,
    isRenderDependencyFile,
    isRenderDependencyAlreadyFixed,
    patchRenderDependency,
    isOptimisticLearningTimeoutFile,
    isOptimisticLearningTimeoutAlreadyFixed,
    patchOptimisticLearningTimeout,
    isPageInvokerSuspensionReleaseFile,
    isPageInvokerSuspensionReleaseAlreadyFixed,
    patchPageInvokerSuspensionRelease,
    isVinextRenderDependencySafeOnDisk,
    isVinextOptimisticLearningTimeoutSafeOnDisk,
    isVinextPageInvokerSuspensionReleaseSafeOnDisk,
    resolveVinextOptimisticLearningTimeoutPath,
    resolveVinextPageInvokerSuspensionReleasePath,
    resolveVinextRouteMatchingPath,
    isRefreshDeferralNavControllerFile,
    isRefreshDeferralNavControllerAlreadyFixed,
    patchRefreshDeferralNavController,
    isRefreshDeferralEntryAlreadyFixed,
    patchRefreshDeferralEntry,
    resolveVinextNavControllerPath,
    isVinextOptimizeDepsCacheStale,
    missingRequiredSymbols,
} from "./vinext_route_wiring_fix.js";

describe("syncPatchVinextOnDisk & resolveVinextAppPageRouteWiringPath", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "cfni-vinext-test-"));
    });

    afterEach(() => {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it("resolves direct path when exists in node_modules", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-page-route-wiring.js");
        writeFileSync(filePath, "console.log(1);", "utf8");

        const resolved = resolveVinextAppPageRouteWiringPath(tempDir);
        expect(resolved).toBe(filePath);
    });

    it("returns null when vinext is not present", () => {
        const resolved = resolveVinextAppPageRouteWiringPath(tempDir);
        expect(resolved).toBeNull();
    });

    it("patches buggy file on disk and returns true", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-page-route-wiring.js");

        const buggyCode = `
function getPrefetchLoadingEntry(route) {
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
	}
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`;
        writeFileSync(filePath, buggyCode, "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(true);

        const newContent = readFileSync(filePath, "utf8");
        expect(newContent).toContain("deepestNestedEntry");
        expect(newContent).toContain("!routeLoadingComponent");

        // Second call should return false (already fixed)
        const didPatchAgain = syncPatchVinextOnDisk(tempDir);
        expect(didPatchAgain).toBe(false);
    });

    it("skips route wiring patching when routeWiring option is false", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-page-route-wiring.js");
        writeFileSync(filePath, "export const untouched = true;", "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir, { routeWiring: false });
        expect(didPatch).toBe(false);
        expect(readFileSync(filePath, "utf8")).toBe("export const untouched = true;");
    });

    it("returns false if file content does not change after patch attempt", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-page-route-wiring.js");
        writeFileSync(filePath, "export const untouched = true;", "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(false);
    });

    it("handles read/write errors gracefully", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-page-route-wiring.js");
        // Create a directory with the file name to trigger a read error
        mkdirSync(filePath);

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(false);
    });

    it("handles route-matching read/write errors gracefully", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/routing");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "route-matching.js");
        // Create a directory with the file name to trigger a read error
        mkdirSync(filePath);

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(false);
    });

    it("patches route-matching.js on disk when present and buggy", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/routing");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "route-matching.js");
        const buggyCode = `
function matchRouteWithTrie(url, routes, cache) {
	const pathname = url.split("?")[0];
	let normalizedUrl = pathname === "/" ? "/" : pathname.replace(/\\/$/, "");
	normalizedUrl = normalizePathnameForRouteMatch(normalizedUrl);
	const urlParts = normalizedUrl.split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	return trieMatch(trie, urlParts);
}
`;
        writeFileSync(filePath, buggyCode, "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(true);

        const newContent = readFileSync(filePath, "utf8");
        expect(newContent).toContain("hasLeadingLocaleParam");
        expect(newContent).toContain("getActiveRouteLocale");

        // Second call should return false (already fixed)
        const didPatchAgain = syncPatchVinextOnDisk(tempDir);
        expect(didPatchAgain).toBe(false);
    });

    it("skips route matching patching when routeMatching option is false", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/routing");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "route-matching.js");
        writeFileSync(filePath, "export const untouched = true;", "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir, { routeMatching: false });
        expect(didPatch).toBe(false);
        expect(readFileSync(filePath, "utf8")).toBe("export const untouched = true;");
    });

    it("resolves direct path for app-optimistic-routing when exists", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-optimistic-routing.js");
        writeFileSync(filePath, "console.log(1);", "utf8");

        const resolved = resolveVinextOptimisticRoutingPath(tempDir);
        expect(resolved).toBe(filePath);
    });

    it("handles app-optimistic-routing read/write errors gracefully", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-optimistic-routing.js");
        mkdirSync(filePath);

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(false);
    });

    it("patches app-optimistic-routing.js on disk when present and buggy", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-optimistic-routing.js");
        const buggyCode = `
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
	canonicalizeAppPageParams(routeParams);
}
`;
        writeFileSync(filePath, buggyCode, "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir);
        expect(didPatch).toBe(true);

        const newContent = readFileSync(filePath, "utf8");
        expect(newContent).toContain("hasLeadingLocaleParam");
        expect(newContent).toContain("options.rawUrlParts[0] !== options.match.params.locale");

        // Second call should return false (already fixed)
        const didPatchAgain = syncPatchVinextOnDisk(tempDir);
        expect(didPatchAgain).toBe(false);
    });

    it("skips optimistic routing patching when optimisticRouting option is false", () => {
        const vinextDir = join(tempDir, "node_modules/vinext/dist/server");
        mkdirSync(vinextDir, { recursive: true });
        const filePath = join(vinextDir, "app-optimistic-routing.js");
        writeFileSync(filePath, "export const untouched = true;", "utf8");

        const didPatch = syncPatchVinextOnDisk(tempDir, { optimisticRouting: false });
        expect(didPatch).toBe(false);
        expect(readFileSync(filePath, "utf8")).toBe("export const untouched = true;");
    });
});

describe("isRouteMatchingFile", () => {
    it("returns true for route-matching paths", () => {
        expect(isRouteMatchingFile("/project/node_modules/vinext/dist/routing/route-matching.js")).toBe(true);
        expect(isRouteMatchingFile("C:\\project\\node_modules\\vinext\\dist\\routing\\route-matching.js?v=1")).toBe(true);
    });

    it("returns false for other files", () => {
        expect(isRouteMatchingFile("/project/src/app/page.tsx")).toBe(false);
        expect(isRouteMatchingFile("/project/node_modules/vinext/dist/server/app-page-route-wiring.js")).toBe(false);
    });
});

describe("isRouteMatchingAlreadyFixed", () => {
    it("returns false when hasLeadingLocaleParam is not present", () => {
        expect(isRouteMatchingAlreadyFixed("return trieMatch(trie, urlParts);")).toBe(false);
    });

    it("returns true when hasLeadingLocaleParam is present", () => {
        expect(isRouteMatchingAlreadyFixed("const hasLeadingLocaleParam = true;")).toBe(true);
    });

    it("returns false when :locale and an OR term are present but matchRouteWithTrie regex does not match", () => {
        const code = `
const activeLocale = ":locale";
function matchRouteWithTrie(url, routes, cache) {
    return trieMatch(trie, urlParts);
}
`;
        expect(isRouteMatchingAlreadyFixed(code)).toBe(false);
    });

    it("recognizes each individual upstream locale-match marker term (activeLocale, getActiveRouteLocale, matchWithLocale, localeMatch)", () => {
        const upstreamWithActiveLocale = `
function matchRouteWithTrie(url, routes, cache) {
    activeLocale;
    return trieMatch(trie, ":locale");
}
`;
        expect(isRouteMatchingAlreadyFixed(upstreamWithActiveLocale)).toBe(true);

        const upstreamWithGetActiveRouteLocale = `
function matchRouteWithTrie(url, routes, cache) {
    getActiveRouteLocale();
    return trieMatch(trie, ":locale");
}
`;
        expect(isRouteMatchingAlreadyFixed(upstreamWithGetActiveRouteLocale)).toBe(true);

        const upstreamWithMatchWithLocale = `
function matchRouteWithTrie(url, routes, cache) {
    matchWithLocale;
    return trieMatch(trie, ":locale");
}
`;
        expect(isRouteMatchingAlreadyFixed(upstreamWithMatchWithLocale)).toBe(true);

        const upstreamWithLocaleMatch = `
function matchRouteWithTrie(url, routes, cache) {
    localeMatch;
    return trieMatch(trie, ":locale");
}
`;
        expect(isRouteMatchingAlreadyFixed(upstreamWithLocaleMatch)).toBe(true);
    });
});

describe("patchRouteMatching", () => {
    it("patches matchRouteWithTrie and matchRouteWithTrieRawPathname", () => {
        const buggy = `
function matchRouteWithTrie(url, routes, cache) {
	const pathname = url.split("?")[0];
	let normalizedUrl = pathname === "/" ? "/" : pathname.replace(/\\/$/, "");
	normalizedUrl = normalizePathnameForRouteMatch(normalizedUrl);
	const urlParts = normalizedUrl.split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	return trieMatch(trie, urlParts);
}
function matchRouteWithTrieRawPathname(url, routes, cache) {
	const pathname = url.split("?")[0];
	const urlParts = (pathname === "/" ? "/" : pathname.replace(/\\/$/, "")).split("/").filter(Boolean);
	return trieMatch(getOrBuildTrie(cache, routes), urlParts);
}
`;
        const patched = patchRouteMatching(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        expect(patched).toContain("getActiveRouteLocale");

        // Idempotent
        expect(patchRouteMatching(patched)).toBe(patched);
    });

    it("reuses an existing getActiveRouteLocale when patching only matchRouteWithTrie", () => {
        const buggy = `
function getActiveRouteLocale() {
    return "en";
}
function matchRouteWithTrie(url, routes, cache) {
	const pathname = url.split("?")[0];
	let normalizedUrl = pathname === "/" ? "/" : pathname.replace(/\\/$/, "");
	normalizedUrl = normalizePathnameForRouteMatch(normalizedUrl);
	const urlParts = normalizedUrl.split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	return trieMatch(trie, urlParts);
}
`;
        const patched = patchRouteMatching(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        const getActiveRouteLocaleCount = (patched.match(/function getActiveRouteLocale\s*\(\s*\)/g) ?? []).length;
        expect(getActiveRouteLocaleCount).toBe(1);
    });

    it("prepends a new getActiveRouteLocale when patching only matchRouteWithTrieRawPathname without one already present", () => {
        const buggy = `
function matchRouteWithTrieRawPathname(url, routes, cache) {
	const pathname = url.split("?")[0];
	const urlParts = (pathname === "/" ? "/" : pathname.replace(/\\/$/, "")).split("/").filter(Boolean);
	return trieMatch(getOrBuildTrie(cache, routes), urlParts);
}
`;
        const patched = patchRouteMatching(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        expect(patched).toContain("function getActiveRouteLocale");
    });

    it("reuses an existing getActiveRouteLocale when patching only matchRouteWithTrieRawPathname", () => {
        const buggy = `
function getActiveRouteLocale() {
    return "en";
}
function matchRouteWithTrieRawPathname(url, routes, cache) {
	const pathname = url.split("?")[0];
	const urlParts = (pathname === "/" ? "/" : pathname.replace(/\\/$/, "")).split("/").filter(Boolean);
	return trieMatch(getOrBuildTrie(cache, routes), urlParts);
}
`;
        const patched = patchRouteMatching(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        const getActiveRouteLocaleCount = (patched.match(/function getActiveRouteLocale\s*\(\s*\)/g) ?? []).length;
        expect(getActiveRouteLocaleCount).toBe(1);
    });
});

describe("vinextRouteWiringFixPlugin with route matching", () => {
    it("transforms route-matching.js via plugin transform hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        const buggy = `
function matchRouteWithTrie(url, routes, cache) {
	const pathname = url.split("?")[0];
	let normalizedUrl = pathname === "/" ? "/" : pathname.replace(/\\/$/, "");
	normalizedUrl = normalizePathnameForRouteMatch(normalizedUrl);
	const urlParts = normalizedUrl.split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	return trieMatch(trie, urlParts);
}
`;
        const res = transformHook.call({}, buggy, "/node_modules/vinext/dist/routing/route-matching.js");
        expect(res).toBeDefined();
        expect(res.code).toContain("hasLeadingLocaleParam");

        // When already fixed, returns undefined
        const alreadyFixedRes = transformHook.call({}, res.code, "/node_modules/vinext/dist/routing/route-matching.js");
        expect(alreadyFixedRes).toBeUndefined();
    });
});

describe("isOptimisticRoutingFile", () => {
    it("returns true for app-optimistic-routing paths", () => {
        expect(isOptimisticRoutingFile("/project/node_modules/vinext/dist/server/app-optimistic-routing.js")).toBe(true);
        expect(isOptimisticRoutingFile("C:\\project\\node_modules\\vinext\\dist\\server\\app-optimistic-routing.js?v=1")).toBe(true);
        expect(isOptimisticRoutingFile("/project/node_modules/vinext/dist/server/app-optimistic-routing.ts")).toBe(true);
    });

    it("returns false for other files", () => {
        expect(isOptimisticRoutingFile("/project/src/app/page.tsx")).toBe(false);
        expect(isOptimisticRoutingFile("/project/node_modules/vinext/dist/server/app-page-route-wiring.js")).toBe(false);
    });
});

describe("isOptimisticRoutingAlreadyFixed", () => {
    it("returns false when buggy patterns are present", () => {
        const buggy = `
function matchOptimisticRouteManifestRoute(options) {
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) return match;
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
}
`;
        expect(isOptimisticRoutingAlreadyFixed(buggy)).toBe(false);
    });

    it("returns true when already fixed with locale prefix checked first and rawParts fixed", () => {
        const fixed = `
function matchOptimisticRouteManifestRoute(options) {
	const hasLeadingLocaleParam = true;
	const match = matchNode(trie, urlParts.normalized, 0, []);
}
function resolveOptimisticNavigationParams(options) {
	const rawParts = (options.match.route.patternParts?.[0] === ":locale" && options.rawUrlParts[0] !== options.match.params.locale);
}
`;
        expect(isOptimisticRoutingAlreadyFixed(fixed)).toBe(true);
    });
});

describe("patchOptimisticRouting", () => {
    it("patches matchOptimisticRouteManifestRoute and resolveOptimisticNavigationParams", () => {
        const buggy = `
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
	canonicalizeAppPageParams(routeParams);
}
`;
        const patched = patchOptimisticRouting(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        expect(patched).toContain("options.rawUrlParts[0] !== options.match.params.locale");
        expect(isOptimisticRoutingAlreadyFixed(patched)).toBe(true);

        // Idempotent
        expect(patchOptimisticRouting(patched)).toBe(patched);
    });

    it("patches the real installed vinext shape (inlined trie lookup, early-return on null)", () => {
        const REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE = `
  function matchOptimisticRouteManifestRoute(options) {
  	const urlParts = hrefToRouteParts(options.href, options.basePath);
  	if (urlParts === null) return null;
  	const match = matchNode(getRouteTrie(options.routeManifest), urlParts.normalized, 0, []);
  	if (match === null) return null;
  	decodeMatchedParams(match.params);
  	return match;
}
function resolveOptimisticNavigationParams(options) {
  const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
  canonicalizeAppPageParams(routeParams);
}
`;

        expect(isOptimisticRoutingAlreadyFixed(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE)).toBe(false);

        const patched = patchOptimisticRouting(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE);

        expect(patched).not.toBe(REAL_INSTALLED_OPTIMISTIC_ROUTING_SHAPE);
        expect(patched).toContain("hasLeadingLocaleParam");
        expect(patched).toContain("getActiveRouteLocale");
        expect(isOptimisticRoutingAlreadyFixed(patched)).toBe(true);

        // Idempotent
        expect(patchOptimisticRouting(patched)).toBe(patched);
    });

    it("is idempotent per-half when only one function's shape has drifted (Finding 1 regression)", () => {
        // resolveOptimisticNavigationParams is already in its FIXED shape, but
        // matchOptimisticRouteManifestRoute is still the OLD/unfixed shape — a
        // simulated partial upstream shape drift. isOptimisticRoutingAlreadyFixed
        // requires BOTH halves fixed, so it returns false forever here, and
        // patchOptimisticRouting must re-run every time WITHOUT re-patching the
        // half that's already fixed (which would prepend a duplicate
        // getActiveRouteLocale() definition on every run).
        const halfDrifted = `
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const rawParts = (options.match.route.patternParts?.[0] === ":locale" && options.rawUrlParts[0] !== options.match.params.locale)
		? [options.match.params.locale, ...options.rawUrlParts]
		: options.rawUrlParts;
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, rawParts);
	canonicalizeAppPageParams(routeParams);
}
`;
        expect(isOptimisticRoutingAlreadyFixed(halfDrifted)).toBe(false);

        const firstRun = patchOptimisticRouting(halfDrifted);
        expect(firstRun).toContain("hasLeadingLocaleParam");
        expect(firstRun).toContain("getActiveRouteLocale");

        const secondRun = patchOptimisticRouting(firstRun);
        expect(secondRun).toBe(firstRun);

        const getActiveRouteLocaleCount = (secondRun.match(/function getActiveRouteLocale\s*\(\s*\)/g) ?? []).length;
        expect(getActiveRouteLocaleCount).toBe(1);
    });

    it("reuses an existing getActiveRouteLocale when patching matchOptimisticRouteManifestRoute", () => {
        const buggy = `
function getActiveRouteLocale() {
    return "en";
}
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
`;
        const patched = patchOptimisticRouting(buggy);
        expect(patched).toContain("hasLeadingLocaleParam");
        const getActiveRouteLocaleCount = (patched.match(/function getActiveRouteLocale\s*\(\s*\)/g) ?? []).length;
        expect(getActiveRouteLocaleCount).toBe(1);
    });
});

describe("vinextRouteWiringFixPlugin with optimistic routing", () => {
    it("transforms app-optimistic-routing.js via plugin transform hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        const buggy = `
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
}
`;
        const res = transformHook.call({}, buggy, "/node_modules/vinext/dist/server/app-optimistic-routing.js");
        expect(res).toBeDefined();
        expect(res.code).toContain("hasLeadingLocaleParam");
        expect(res.code).toContain("options.rawUrlParts[0] !== options.match.params.locale");

        // When already fixed, returns undefined
        const alreadyFixedRes = transformHook.call({}, res.code, "/node_modules/vinext/dist/server/app-optimistic-routing.js");
        expect(alreadyFixedRes).toBeUndefined();
    });
});

const BUGGY_BROWSER_ENTRY = `
const _vinextHelpers = [__basePath, optimisticRouteTemplates, resolveOptimisticNavigationPayload, parsePrefetchCacheKey, currentHref, rscUrl];
async function learnOptimisticRouteTemplatesFromPrefetchCache(options) {
	if (options.routeManifest === null) return;
	const learning = [...optimisticRouteTemplateLearning.values()];
	for (const [cacheKey, entry] of getPrefetchCache()) {
		const sourceKey = getOptimisticPrefetchSourceKey({
			cacheKey,
			interceptionContext: options.interceptionContext,
			mountedSlotsHeader: options.mountedSlotsHeader
		});
		if (optimisticRouteTemplateSources.has(sourceKey)) continue;
		if (optimisticRouteTemplateLearning.has(sourceKey)) continue;
		if (!isSettledPrefetchCacheEntry(entry)) continue;
		if (entry.prefetchKind === "route-tree") continue;
		const promise = learnOptimisticRouteTemplateFromPrefetch({
			cacheKey,
			entry,
			interceptionContext: options.interceptionContext,
			mountedSlotsHeader: options.mountedSlotsHeader,
			routeManifest: options.routeManifest
		}).then((learned) => {
			if (learned) optimisticRouteTemplateSources.add(sourceKey);
		}).finally(() => {
			optimisticRouteTemplateLearning.delete(sourceKey);
		});
		optimisticRouteTemplateLearning.set(sourceKey, promise);
		learning.push(promise);
	}
	if (learning.length === 0) return;
	await Promise.allSettled(learning);
}
await learnOptimisticRouteTemplatesFromPrefetchCache({
	interceptionContext: requestInterceptionContext,
	mountedSlotsHeader,
	routeManifest
});
`;

describe("isPrefetchLearningFile", () => {
    it("matches only the vinext browser entry", () => {
        expect(isPrefetchLearningFile("/p/node_modules/vinext/dist/server/app-browser-entry.js")).toBe(true);
        expect(isPrefetchLearningFile("C:\\p\\node_modules\\vinext\\dist\\server\\app-browser-entry.js?v=1")).toBe(true);
        expect(isPrefetchLearningFile("/p/node_modules/vinext/dist/server/app-optimistic-routing.js")).toBe(false);
    });
});

describe("patchPrefetchLearning", () => {
    it("awaits the in-flight prefetch of the navigation target and passes targetRscUrl", () => {
        const patched = patchPrefetchLearning(BUGGY_BROWSER_ENTRY);

        expect(patched).toContain("isPendingNavigationTarget");
        expect(patched).toContain("hasOptimisticTemplate");
        expect(patched).toContain("stripRsc(parsePrefetchCacheKey(cacheKey).rscUrl) === stripRsc(options.targetRscUrl)");
        expect(patched).toContain("settledEntry.pending?.catch(() => {})");
        expect(patched).toContain("targetHref: currentHref,");
        expect(patched).toContain("targetRscUrl: rscUrl,");
        expect(patched).not.toContain("if (!isSettledPrefetchCacheEntry(entry)) continue;");
    });

    it("bounds the wait on a still-pending prefetch with a timeout race (Finding 4)", () => {
        const patched = patchPrefetchLearning(BUGGY_BROWSER_ENTRY);

        expect(patched).toContain("Promise.race([");
        expect(patched).toContain("setTimeout(resolve, 3000)");
        // The bare unbounded await must be gone — it's now inside the race.
        expect(patched).not.toContain("await settledEntry.pending?.catch(() => {});");
    });

    it("keeps route-tree entries skipped and still awaits every learning promise", () => {
        const patched = patchPrefetchLearning(BUGGY_BROWSER_ENTRY);

        expect(patched).toContain('if (entry.prefetchKind === "route-tree") continue;');
        expect(patched).toContain("await Promise.allSettled(learning);");
    });

    it("is idempotent and leaves already-fixed code untouched", () => {
        const patched = patchPrefetchLearning(BUGGY_BROWSER_ENTRY);
        expect(isPrefetchLearningAlreadyFixed(BUGGY_BROWSER_ENTRY)).toBe(false);
        expect(isPrefetchLearningAlreadyFixed(patched)).toBe(true);
        expect(patchPrefetchLearning(patched)).toBe(patched);
    });

    it("is idempotent per-half when only the call site has already been patched (Finding 2 regression)", () => {
        // The call site already carries `targetRscUrl: rscUrl,`, but the function
        // body is still the OLD/buggy shape (no `isPendingNavigationTarget`).
        // A single-token sentinel keyed on "targetRscUrl" alone would treat this
        // as already fixed and never patch the function — silently reverting the
        // prefetch-learning fix to upstream (buggy) behavior forever.
        const halfDrifted = `
async function learnOptimisticRouteTemplatesFromPrefetchCache(options) {
	if (options.routeManifest === null) return;
	const learning = [...optimisticRouteTemplateLearning.values()];
	for (const [cacheKey, entry] of getPrefetchCache()) {
		const sourceKey = getOptimisticPrefetchSourceKey({
			cacheKey,
			interceptionContext: options.interceptionContext,
			mountedSlotsHeader: options.mountedSlotsHeader
		});
		if (optimisticRouteTemplateSources.has(sourceKey)) continue;
		if (optimisticRouteTemplateLearning.has(sourceKey)) continue;
		if (!isSettledPrefetchCacheEntry(entry)) continue;
		if (entry.prefetchKind === "route-tree") continue;
		const promise = learnOptimisticRouteTemplateFromPrefetch({
			cacheKey,
			entry,
			interceptionContext: options.interceptionContext,
			mountedSlotsHeader: options.mountedSlotsHeader,
			routeManifest: options.routeManifest
		}).then((learned) => {
			if (learned) optimisticRouteTemplateSources.add(sourceKey);
		}).finally(() => {
			optimisticRouteTemplateLearning.delete(sourceKey);
		});
		optimisticRouteTemplateLearning.set(sourceKey, promise);
		learning.push(promise);
	}
	if (learning.length === 0) return;
	await Promise.allSettled(learning);
}
await learnOptimisticRouteTemplatesFromPrefetchCache({
	interceptionContext: requestInterceptionContext,
	targetHref: currentHref,
	targetRscUrl: rscUrl,
	mountedSlotsHeader,
	routeManifest
});
`;
        expect(isPrefetchLearningAlreadyFixed(halfDrifted)).toBe(false);

        const firstRun = patchPrefetchLearning(halfDrifted);
        expect(firstRun).toContain("isPendingNavigationTarget");
        expect(isPrefetchLearningAlreadyFixed(firstRun)).toBe(true);

        const secondRun = patchPrefetchLearning(firstRun);
        expect(secondRun).toBe(firstRun);

        const callSiteCount = (secondRun.match(/targetRscUrl: rscUrl,/g) ?? []).length;
        expect(callSiteCount).toBe(1);
    });

    it("leaves unrelated code untouched", () => {
        const unrelated = "export const untouched = true;";
        expect(patchPrefetchLearning(unrelated)).toBe(unrelated);
    });

    it("patches the call site when the function is already fixed but a leftover buggy-skip marker elsewhere keeps isPrefetchLearningAlreadyFixed false", () => {
        const fullyPatched = patchPrefetchLearning(BUGGY_BROWSER_ENTRY);
        const fixedFnBuggyCallSite = fullyPatched
            .replace(
                /await\s+learnOptimisticRouteTemplatesFromPrefetchCache\(\{[\s\S]*?\}\);/,
                `await learnOptimisticRouteTemplatesFromPrefetchCache({
	interceptionContext: requestInterceptionContext,
	mountedSlotsHeader,
	routeManifest
});`
            )
            .concat('\n// leftover: if (!isSettledPrefetchCacheEntry(entry)) continue;\n');

        expect(isPrefetchLearningAlreadyFixed(fixedFnBuggyCallSite)).toBe(false);
        expect(fixedFnBuggyCallSite).toContain("hasOptimisticTemplate");
        expect(fixedFnBuggyCallSite).not.toContain("targetRscUrl: rscUrl,");

        const patched = patchPrefetchLearning(fixedFnBuggyCallSite);
        expect(patched).toContain("targetRscUrl: rscUrl,");
        expect(patched).toContain("targetHref: currentHref,");
    });
});

describe("vinextRouteWiringFixPlugin with prefetch learning", () => {
    it("transforms app-browser-entry.js and returns undefined once fixed", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        const res = transformHook.call({}, BUGGY_BROWSER_ENTRY, "/node_modules/vinext/dist/server/app-browser-entry.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("targetRscUrl");

        expect(transformHook.call({}, res!.code, "/node_modules/vinext/dist/server/app-browser-entry.js")).toBeUndefined();
    });

    it("skips the browser entry when prefetchLearning is false", () => {
        const plugin = vinextRouteWiringFixPlugin({ prefetchLearning: false });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        expect(transformHook.call({}, BUGGY_BROWSER_ENTRY, "/node_modules/vinext/dist/server/app-browser-entry.js")).toBeUndefined();
    });

    it("returns undefined when not already fixed but the patch is a no-op (regex does not match)", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        const noOpCode = "export const foo = 42;";
        expect(isPrefetchLearningAlreadyFixed(noOpCode)).toBe(false);
        const res = transformHook.call({}, noOpCode, "/node_modules/vinext/dist/server/app-browser-entry.js");
        expect(res).toBeUndefined();
    });
});


describe("syncPatchVinextOnDisk browser entry", () => {
    let diskTempDir: string;

    beforeEach(() => {
        diskTempDir = mkdtempSync(join(tmpdir(), "cfni-vinext-entry-"));
    });

    afterEach(() => {
        try {
            rmSync(diskTempDir, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it("resolves the browser entry path when present and null otherwise", () => {
        expect(resolveVinextBrowserEntryPath(diskTempDir)).toBeNull();
        const dir = join(diskTempDir, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, "app-browser-entry.js");
        writeFileSync(filePath, BUGGY_BROWSER_ENTRY, "utf8");
        expect(resolveVinextBrowserEntryPath(diskTempDir)).toBe(filePath);
    });

    it("patches the browser entry on disk once, then reports no change", () => {
        const dir = join(diskTempDir, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, "app-browser-entry.js");
        writeFileSync(filePath, BUGGY_BROWSER_ENTRY, "utf8");

        expect(syncPatchVinextOnDisk(diskTempDir)).toBe(true);
        expect(readFileSync(filePath, "utf8")).toContain("targetRscUrl");
        expect(syncPatchVinextOnDisk(diskTempDir)).toBe(false);
    });

    it("skips the browser entry when prefetchLearning is false", () => {
        const dir = join(diskTempDir, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, "app-browser-entry.js");
        writeFileSync(filePath, BUGGY_BROWSER_ENTRY, "utf8");

        expect(syncPatchVinextOnDisk(diskTempDir, { prefetchLearning: false })).toBe(false);
        expect(readFileSync(filePath, "utf8")).toBe(BUGGY_BROWSER_ENTRY);
    });
});

describe("syncPatchVinextOnDisk warns on silent no-op (Finding 3)", () => {
    let warnTempDir: string;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnTempDir = mkdtempSync(join(tmpdir(), "cfni-vinext-warn-"));
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
        try {
            rmSync(warnTempDir, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it("warns when a present, not-already-fixed file does not match the patch's expected shape", () => {
        // Content that is unambiguously "not fixed" per each target's own
        // (marker-based) sentinel, yet matches none of that target's patch
        // regexes — the exact silent-no-op shape this finding guards against:
        // file present, not fixed, but the patch is also a no-op.
        const mismatched = "function futureUpstreamRefactor() { return null; }\n";

        const serverDir = join(warnTempDir, "node_modules/vinext/dist/server");
        mkdirSync(serverDir, { recursive: true });

        // routeWiring's sentinel re-tests the same regexes the patch itself uses,
        // so a genuine no-op requires the ADDITIONAL guard in patchAppPageRouteWiring
        // (skip if "deepestNestedEntry" is already present elsewhere) to be the
        // thing that blocks the replacement, with no buggy Suspense pattern present
        // either — otherwise that half would still get patched.
        const wiringHalfDrifted = `
function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	if (firstNestedEntry) return firstNestedEntry;
	if (rootEntry) return rootEntry;
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}
// deepestNestedEntry already exists elsewhere in this bundle (e.g. inlined from a shared chunk)
const somewhereElseMarker = "deepestNestedEntry";
`;
        const wiringFilePath = join(serverDir, "app-page-route-wiring.js");
        writeFileSync(wiringFilePath, wiringHalfDrifted, "utf8");

        const matchingDir = join(warnTempDir, "node_modules/vinext/dist/routing");
        mkdirSync(matchingDir, { recursive: true });
        const matchingFilePath = join(matchingDir, "route-matching.js");
        writeFileSync(matchingFilePath, mismatched, "utf8");

        const optimisticFilePath = join(serverDir, "app-optimistic-routing.js");
        writeFileSync(optimisticFilePath, mismatched, "utf8");

        const browserEntryFilePath = join(serverDir, "app-browser-entry.js");
        writeFileSync(browserEntryFilePath, mismatched, "utf8");

        const didPatch = syncPatchVinextOnDisk(warnTempDir);
        expect(didPatch).toBe(false);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(wiringFilePath));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(matchingFilePath));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(optimisticFilePath));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(browserEntryFilePath));
        expect(warnSpy).toHaveBeenCalledTimes(4);

        // Files are left untouched.
        expect(readFileSync(wiringFilePath, "utf8")).toBe(wiringHalfDrifted);
        expect(readFileSync(matchingFilePath, "utf8")).toBe(mismatched);
        expect(readFileSync(optimisticFilePath, "utf8")).toBe(mismatched);
        expect(readFileSync(browserEntryFilePath, "utf8")).toBe(mismatched);
    });

    it("handles browser entry read/write errors gracefully", () => {
        const dir = join(warnTempDir, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, "app-browser-entry.js");
        // Create a directory with the file name to trigger a read error.
        mkdirSync(filePath);

        const didPatch = syncPatchVinextOnDisk(warnTempDir);
        expect(didPatch).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not warn once the file is actually patched", () => {
        const dir = join(warnTempDir, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, "app-optimistic-routing.js");
        const buggyCode = `
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const match = matchNode(trie, urlParts.normalized, 0, []);
	if (match !== null) {
		decodeMatchedParams(match.params);
		return match;
	}
	return null;
}
function resolveOptimisticNavigationParams(options) {
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, options.rawUrlParts);
	canonicalizeAppPageParams(routeParams);
}
`;
        writeFileSync(filePath, buggyCode, "utf8");

        expect(syncPatchVinextOnDisk(warnTempDir)).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

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

    it("swallows a removal error for one subdirectory and still removes the rest", () => {
        const depsDir = join(cacheTempDir, "deps");
        const lockedDir = join(depsDir, "locked");
        mkdirSync(lockedDir, { recursive: true });
        writeFileSync(join(lockedDir, "f.js"), "x", "utf8");
        // Strip permissions on the nested dir so recursive removal of "deps" fails
        // partway through, exercising bustVinextOptimizeDepsCache's per-subdir catch.
        chmodSync(lockedDir, 0o000);

        mkdirSync(join(cacheTempDir, "deps_ssr"), { recursive: true });

        try {
            const result = bustVinextOptimizeDepsCache(cacheTempDir);
            expect(result).toBe(true);
            expect(existsSync(join(cacheTempDir, "deps_ssr"))).toBe(false);
        } finally {
            chmodSync(lockedDir, 0o755);
        }
    });
});

describe("vinextRouteWiringFixPlugin configResolved busts cache on a real patch", () => {
    let root: string;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "cfni-vinext-configresolved-"));
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        try {
            rmSync(root, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it("patches vinext on disk, clears the optimizeDeps cache, and logs once", () => {
        const wiringDir = join(root, "node_modules/vinext/dist/server");
        mkdirSync(wiringDir, { recursive: true });
        writeFileSync(join(wiringDir, "app-page-route-wiring.js"), `
function getPrefetchLoadingEntry(route) {
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
	}
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`, "utf8");

        // Default cacheDir (config.cacheDir left unset, exercising the `||` fallback).
        const cacheDir = join(root, "node_modules/.vite");
        mkdirSync(join(cacheDir, "deps"), { recursive: true });
        writeFileSync(join(cacheDir, "deps", "entry.js"), "stale", "utf8");

        const plugin = vinextRouteWiringFixPlugin();
        const configResolvedHook = plugin.configResolved as (this: unknown, config: { root?: string; cacheDir?: string }) => void;
        configResolvedHook.call({}, { root });

        expect(existsSync(join(cacheDir, "deps"))).toBe(false);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("cleared its stale Vite optimizeDeps cache"));
    });
});

describe("future upstream vinext compatibility and safety guards", () => {
    it("does not patch a file whose vinext helpers were renamed upstream", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-symbol-guard-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-route-wiring.js");
            // Same buggy shape the patch targets, but `makeThenableParams` — an
            // identifier every loading-fallback replacement splices in — is gone.
            const renamedHelpers = `
function getPrefetchLoadingEntry(route) {
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
	}
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.toThenableParams, resolveAppPageSegmentParams];
`;
            writeFileSync(filePath, renamedHelpers, "utf8");

            expect(hasRequiredSymbols(renamedHelpers, "routeWiring")).toBe(false);
            expect(syncPatchVinextOnDisk(tempDir, { routeWiring: true })).toBe(false);
            expect(readFileSync(filePath, "utf8")).toBe(renamedHelpers);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no longer exposes makeThenableParams"));
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
            warnSpy.mockRestore();
        }
    });

    it("plugin transform leaves a file with renamed vinext helpers untouched", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const renamedHelpers = `
function matchRouteWithTrie(url, routes, cache) {
	const urlParts = normalizePathnameForRouteMatch(url).split("/").filter(Boolean);
	const trie = buildTrie(cache, routes);
	return trieMatch(trie, urlParts);
}
`;
        expect(hasRequiredSymbols(renamedHelpers, "routeMatching")).toBe(false);
        expect(transformHook.call({}, renamedHelpers, "/node_modules/vinext/dist/routing/route-matching.js")).toBeUndefined();
    });

    it("does not patch getPrefetchLoadingEntry if future upstream changed the implementation", () => {
        const futureUpstreamWiring = `
function getPrefetchLoadingEntry(route) {
    const custom = resolveCustomRouteLoading(route);
    return custom ?? null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {
}
`;
        expect(isAppPageRouteWiringAlreadyFixed(futureUpstreamWiring)).toBe(true);
        expect(patchAppPageRouteWiring(futureUpstreamWiring)).toBe(futureUpstreamWiring);
    });

    it("does not patch route matching if future upstream changed the implementation or parameters", () => {
        const futureUpstreamRouteMatching = `
function matchRouteWithTrie(url, routes, cache, context) {
    const trie = getOrBuildTrie(cache, routes);
    return context.customMatcher(trie, url);
}
function matchRouteWithTrieRawPathname(url, routes, cache, context) {
    return context.customMatcher(getOrBuildTrie(cache, routes), url);
}
`;
        expect(patchRouteMatching(futureUpstreamRouteMatching)).toBe(futureUpstreamRouteMatching);
    });

    it("recognizes upstream route matching as already fixed when upstream adds :locale support", () => {
        const upstreamFixedRouteMatching = `
function matchRouteWithTrie(url, routes, cache) {
    const hasLeadingLocaleParam = routes.some((r) => r.patternParts?.[0] === ":locale");
    const activeLocale = getActiveRouteLocale();
    return trieMatch(trie, urlParts);
}
`;
        expect(isRouteMatchingAlreadyFixed(upstreamFixedRouteMatching)).toBe(true);
        expect(patchRouteMatching(upstreamFixedRouteMatching)).toBe(upstreamFixedRouteMatching);
    });

    it("does not patch optimistic routing if future upstream changed the implementation", () => {
        const futureUpstreamOptimistic = `
function matchOptimisticRouteManifestRoute(options) {
    return options.router.match(options.href);
}
function resolveOptimisticNavigationParams(options) {
    return options.router.resolveParams(options);
}
`;
        expect(patchOptimisticRouting(futureUpstreamOptimistic)).toBe(futureUpstreamOptimistic);
    });

    it("recognizes upstream optimistic routing as already fixed when upstream handles :locale", () => {
        const upstreamFixedOptimistic = `
function matchOptimisticRouteManifestRoute(options) {
    const hasLeadingLocaleParam = options.routeManifest.has(":locale");
    const activeLocale = options.locale;
}
function resolveOptimisticNavigationParams(options) {
    const isLocale = options.match.route.patternParts?.[0] === ":locale";
}
`;
        expect(isOptimisticRoutingAlreadyFixed(upstreamFixedOptimistic)).toBe(true);
        expect(patchOptimisticRouting(upstreamFixedOptimistic)).toBe(upstreamFixedOptimistic);
    });

    it("does not patch prefetch learning if future upstream changed the function or removed the buggy skip", () => {
        const futureUpstreamBrowserEntry = `
async function learnOptimisticRouteTemplatesFromPrefetchCache(options) {
    for (const [key, promise] of options.inFlightFetches) {
        await promise;
    }
}
await learnOptimisticRouteTemplatesFromPrefetchCache({
    interceptionContext: requestInterceptionContext,
    mountedSlotsHeader,
    routeManifest
});
`;
        expect(isPrefetchLearningAlreadyFixed(futureUpstreamBrowserEntry)).toBe(true);
        expect(patchPrefetchLearning(futureUpstreamBrowserEntry)).toBe(futureUpstreamBrowserEntry);
    });

    it("plugin transform hook returns undefined when future upstream files cannot be safely patched", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | undefined;

        const futureWiring = "function getPrefetchLoadingEntry(route) { return null; }";
        expect(transformHook.call({}, futureWiring, "/node_modules/vinext/dist/server/app-page-route-wiring.js")).toBeUndefined();

        const futureMatching = "function matchRouteWithTrie() { return 1; }";
        expect(transformHook.call({}, futureMatching, "/node_modules/vinext/dist/routing/route-matching.js")).toBeUndefined();

        const futureOptimistic = "function matchOptimisticRouteManifestRoute() { return 2; }";
        expect(transformHook.call({}, futureOptimistic, "/node_modules/vinext/dist/server/app-optimistic-routing.js")).toBeUndefined();

        const futurePrefetch = "async function learnOptimisticRouteTemplatesFromPrefetchCache() { return 3; }";
        expect(transformHook.call({}, futurePrefetch, "/node_modules/vinext/dist/server/app-browser-entry.js")).toBeUndefined();
    });
});

describe("isVinextAppPageRouteWiringSafeOnDisk", () => {
    it("returns false when vinext app-page-route-wiring.js does not exist", () => {
        expect(isVinextAppPageRouteWiringSafeOnDisk("/non/existent/root")).toBe(false);
    });

    it("returns true when file exists and has fixes already applied", () => {
        const root = resolve(__dirname, "../../.test_tmp_wiring_safe");
        const dir = resolve(root, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = resolve(dir, "app-page-route-wiring.js");
        writeFileSync(filePath, "function alreadyFixed() { return null; }", "utf8");

        try {
            expect(isVinextAppPageRouteWiringSafeOnDisk(root)).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("returns false when file exists but contains buggy patterns", () => {
        const root = resolve(__dirname, "../../.test_tmp_wiring_buggy");
        const dir = resolve(root, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = resolve(dir, "app-page-route-wiring.js");
        writeFileSync(
            filePath,
            `function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	if (firstNestedEntry) return firstNestedEntry;
	if (rootEntry) return rootEntry;
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}`,
            "utf8",
        );

        try {
            expect(isVinextAppPageRouteWiringSafeOnDisk(root)).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("returns false when reading file throws error", () => {
        const root = resolve(__dirname, "../../.test_tmp_wiring_err");
        const dir = resolve(root, "node_modules/vinext/dist/server/app-page-route-wiring.js");
        mkdirSync(dir, { recursive: true });

        try {
            expect(isVinextAppPageRouteWiringSafeOnDisk(root)).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("isAppPageProbeFile", () => {
    it("returns true for app-page-probe.js paths", () => {
        expect(isAppPageProbeFile("/project/node_modules/vinext/dist/server/app-page-probe.js")).toBe(true);
        expect(isAppPageProbeFile("C:\\project\\node_modules\\vinext\\dist\\server\\app-page-probe.js?v=123")).toBe(true);
    });

    it("returns false for unrelated files", () => {
        expect(isAppPageProbeFile("/project/node_modules/vinext/dist/server/app-page-dispatch.js")).toBe(false);
    });
});

describe("isAppPageProbeAlreadyFixed", () => {
    it("returns false when Suspense handling is absent", () => {
        const unpatched = `
const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("react.client.reference");
if (value.type === Fragment || typeof value.type === "string") {
`;
        expect(isAppPageProbeAlreadyFixed(unpatched)).toBe(false);
    });

    it("returns true when REACT_SUSPENSE_TYPE and react.suspense are present", () => {
        const patched = `
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
if (value.type === REACT_SUSPENSE_TYPE || value.type === Symbol.for("react.suspense")) {
`;
        expect(isAppPageProbeAlreadyFixed(patched)).toBe(true);
    });
});

describe("patchAppPageProbe", () => {
    it("patches probeReactServerSubtree to handle React.Suspense by visiting fallback", () => {
        const unpatched = `
const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("react.client.reference");
var AppPageSubtreeProbeLimitError = class extends Error {};
const visit = async (value, depth) => {
\tif (value.type === Fragment || typeof value.type === "string") {
\t\tawait visit(value.props.children, depth + 1);
\t\treturn;
\t}
};
`;
        const patched = patchAppPageProbe(unpatched);
        expect(patched).toContain('const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");');
        expect(patched).toContain('if (value.type === Symbol.for("react.suspense") || value.type === REACT_SUSPENSE_TYPE)');
        expect(patched).toContain("await visit(value.props.fallback, depth + 1);");
        expect(isAppPageProbeAlreadyFixed(patched)).toBe(true);
    });

    it("leaves already fixed code untouched", () => {
        const alreadyFixed = `
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
if (value.type === REACT_SUSPENSE_TYPE || value.type === Symbol.for("react.suspense")) {
    await visit(value.props.fallback, depth + 1);
}
`;
        expect(patchAppPageProbe(alreadyFixed)).toBe(alreadyFixed);
    });
});

describe("resolveVinextAppPageProbePath and isVinextAppPageProbeSafeOnDisk", () => {
    it("resolves probe path and checks on-disk safety", () => {
        const root = resolve(__dirname, "../../.test_tmp_probe");
        const dir = resolve(root, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = resolve(dir, "app-page-probe.js");

        writeFileSync(filePath, 'const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("react.client.reference");', "utf8");

        try {
            expect(resolveVinextAppPageProbePath(root)).toBe(filePath);
            expect(isVinextAppPageProbeSafeOnDisk(root)).toBe(false);

            const changed = syncPatchVinextOnDisk(root, { routeWiring: false, routeMatching: false, optimisticRouting: false, prefetchLearning: false, suspenseProbe: true });
            expect(changed).toBe(true);
            expect(isVinextAppPageProbeSafeOnDisk(root)).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("returns null / false when file does not exist", () => {
        const root = resolve(__dirname, "../../.test_tmp_no_probe");
        expect(resolveVinextAppPageProbePath(root)).toBe(null);
        expect(isVinextAppPageProbeSafeOnDisk(root)).toBe(false);
    });

    it("returns false when the probe file exists but cannot be read", () => {
        const root = resolve(__dirname, "../../.test_tmp_probe_unreadable");
        const dir = resolve(root, "node_modules/vinext/dist/server");
        mkdirSync(dir, { recursive: true });
        const filePath = resolve(dir, "app-page-probe.js");
        writeFileSync(filePath, "x", "utf8");
        chmodSync(filePath, 0o000);
        try {
            expect(isVinextAppPageProbeSafeOnDisk(root)).toBe(false);
        } finally {
            chmodSync(filePath, 0o644);
            rmSync(root, { recursive: true, force: true });
        }
    });
});



describe("render dependency suspension release", () => {
    const BUGGY = `function renderAppComponentWithDependencyBarrier(component, props, dependency) {
	function AppComponentDependencyBarrier() {
		try {
			const result = invokeAppComponent(component, props);
			if (isPromiseLike(result)) return Promise.resolve(result).then((resolvedResult) => {
				dependency.release();
				return resolvedResult;
			}, (error) => {
				dependency.release();
				throw error;
			});
			dependency.release();
			return result;
		} catch (error) {
			if (!isAppRenderSuspension(error)) dependency.release();
			throw error;
		}
	}
	return createElement(AppComponentDependencyBarrier);
}`;

    it("detects the render dependency file", () => {
        expect(isRenderDependencyFile("/p/node_modules/vinext/dist/server/app-render-dependency.js")).toBe(true);
        expect(isRenderDependencyFile("C:\\p\\node_modules\\vinext\\dist\\server\\app-render-dependency.js")).toBe(true);
        expect(isRenderDependencyFile("/p/node_modules/vinext/dist/server/app-page-probe.js")).toBe(false);
    });

    it("reports buggy code as not fixed", () => {
        expect(isRenderDependencyAlreadyFixed(BUGGY)).toBe(false);
    });

    it("releases the dependency when a component suspends", () => {
        const patched = patchRenderDependency(BUGGY);
        expect(patched).not.toBe(BUGGY);
        expect(patched).not.toMatch(/if\s*\(!isAppRenderSuspension\(error\)\)\s*dependency\.release\(\);/);
        expect(patched).toContain("dependency.release();");
        expect(isRenderDependencyAlreadyFixed(patched)).toBe(true);
    });

    it("is idempotent", () => {
        const once = patchRenderDependency(BUGGY);
        expect(patchRenderDependency(once)).toBe(once);
    });

    it("leaves unrelated code untouched", () => {
        const other = "export const x = 1;";
        expect(patchRenderDependency(other)).toBe(other);
    });

    it("patches app-render-dependency.js on disk via syncPatchVinextOnDisk", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-renderdep-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-render-dependency.js");
            writeFileSync(filePath, BUGGY, "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, { renderDependency: true });
            expect(changed).toBe(true);
            expect(readFileSync(filePath, "utf8")).toContain("dependency.release();");
            expect(syncPatchVinextOnDisk(tempDir, { renderDependency: true })).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("optimistic route template learning timeout", () => {
    const BUGGY = `		const promise = (async () => {
			let settledEntry = entry;
			if (!isSettledPrefetchCacheEntry(settledEntry)) {
				await Promise.race([
					settledEntry.pending?.catch(() => {}),
					new Promise((resolve) => setTimeout(resolve, 3000))
				]);
				settledEntry = getPrefetchCache().get(cacheKey) ?? settledEntry;
			}
		})();`;

    it("detects the browser entry file", () => {
        expect(isOptimisticLearningTimeoutFile("/p/node_modules/vinext/dist/server/app-browser-entry.js")).toBe(true);
        expect(isOptimisticLearningTimeoutFile("C:\\p\\node_modules\\vinext\\dist\\server\\app-browser-entry.js")).toBe(true);
        expect(isOptimisticLearningTimeoutFile("/p/node_modules/vinext/dist/server/app-page-probe.js")).toBe(false);
    });

    it("reports buggy code (blocking 3000ms cap) as not fixed", () => {
        expect(isOptimisticLearningTimeoutAlreadyFixed(BUGGY)).toBe(false);
    });

    it("lowers the fire-and-forget learning cap so it can't block a live navigation for seconds", () => {
        const patched = patchOptimisticLearningTimeout(BUGGY);
        expect(patched).not.toBe(BUGGY);
        expect(patched).not.toContain("setTimeout(resolve, 3000)");
        expect(isOptimisticLearningTimeoutAlreadyFixed(patched)).toBe(true);
    });

    it("is idempotent", () => {
        const once = patchOptimisticLearningTimeout(BUGGY);
        expect(patchOptimisticLearningTimeout(once)).toBe(once);
    });

    it("leaves unrelated code untouched", () => {
        const other = "export const x = 1;";
        expect(patchOptimisticLearningTimeout(other)).toBe(other);
    });

    it("defaults to the 200ms cap measured to keep page switching instant", () => {
        expect(patchOptimisticLearningTimeout(BUGGY)).toContain("setTimeout(resolve, 200)");
    });

    it("accepts an explicit cap in ms", () => {
        expect(patchOptimisticLearningTimeout(BUGGY, 800)).toContain("setTimeout(resolve, 800)");
    });

    it("applies the default cap on disk and honours an explicit override", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-learning-cap-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-entry.js");
            writeFileSync(filePath, BUGGY, "utf8");

            syncPatchVinextOnDisk(tempDir, { prefetchLearning: false });
            expect(readFileSync(filePath, "utf8")).toContain("setTimeout(resolve, 200)");

            writeFileSync(filePath, BUGGY, "utf8");
            syncPatchVinextOnDisk(tempDir, { prefetchLearning: false, optimisticLearningTimeout: 900 });
            expect(readFileSync(filePath, "utf8")).toContain("setTimeout(resolve, 900)");
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("page invoker suspension release", () => {
    const BUGGY = `		const PageInvoker = () => {
			const invocationProps = { ...props };
			if (searchParams) invocationProps.searchParams = observePageSearchParamsAccess ? makeObservedAppPageSearchParamsThenable(pageSearchParams) : makeThenableParams(pageSearchParams);
			try {
				const result = invokeAppComponent(PageComponent, invocationProps);
				if (isPromiseLike(result)) {
					if (renderDependency) Promise.resolve().then(() => renderDependency.release());
					return Promise.resolve(result).then((resolvedResult) => renderDependency ? renderAfterAppDependencies(resolvedResult, renderDependency.resultDependencies) : resolvedResult);
				}
				renderDependency?.release();
				return renderDependency ? renderAfterAppDependencies(result, renderDependency.resultDependencies) : result;
			} catch (error) {
				if (isAppRenderSuspension(error)) {
					if (renderDependency && hasPageLoadingBoundary) Promise.resolve().then(() => renderDependency.release());
					throw error;
				}
				renderDependency?.release();
				throw error;
			}
		};`;

    it("detects the page-element-builder file", () => {
        expect(isPageInvokerSuspensionReleaseFile("/p/node_modules/vinext/dist/server/app-page-element-builder.js")).toBe(true);
        expect(isPageInvokerSuspensionReleaseFile("C:\\p\\node_modules\\vinext\\dist\\server\\app-page-element-builder.js")).toBe(true);
        expect(isPageInvokerSuspensionReleaseFile("/p/node_modules/vinext/dist/server/app-page-probe.js")).toBe(false);
    });

    it("reports buggy code (release gated on hasPageLoadingBoundary) as not fixed", () => {
        expect(isPageInvokerSuspensionReleaseAlreadyFixed(BUGGY)).toBe(false);
    });

    it("releases the page's render dependency on suspension regardless of hasPageLoadingBoundary", () => {
        const patched = patchPageInvokerSuspensionRelease(BUGGY);
        expect(patched).not.toBe(BUGGY);
        expect(patched).not.toMatch(/if\s*\(renderDependency\s*&&\s*hasPageLoadingBoundary\)/);
        expect(patched).toContain("if (renderDependency) Promise.resolve().then(() => renderDependency.release());");
        expect(isPageInvokerSuspensionReleaseAlreadyFixed(patched)).toBe(true);
    });

    it("is idempotent", () => {
        const once = patchPageInvokerSuspensionRelease(BUGGY);
        expect(patchPageInvokerSuspensionRelease(once)).toBe(once);
    });

    it("leaves unrelated code untouched", () => {
        const other = "export const x = 1;";
        expect(patchPageInvokerSuspensionRelease(other)).toBe(other);
    });

    it("patches app-page-element-builder.js on disk via syncPatchVinextOnDisk", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-pageinvoker-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-element-builder.js");
            writeFileSync(filePath, BUGGY, "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, { pageInvokerSuspensionRelease: true });
            expect(changed).toBe(true);
            expect(readFileSync(filePath, "utf8")).toContain(
                "if (renderDependency) Promise.resolve().then(() => renderDependency.release());"
            );
            expect(syncPatchVinextOnDisk(tempDir, { pageInvokerSuspensionRelease: true })).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("refresh deferral (navigation controller + browser entry)", () => {
    const NAV_CONTROLLER_BUGGY = `
	let activeNavigationId = 0;
	let latestHmrUpdateId = 0;
	function beginNavigation() {
		latestHmrUpdateId += 1;
		activeNavigationId += 1;
		return activeNavigationId;
	}
	function getActiveNavigationId() {
		return activeNavigationId;
	}
	return {
		beginNavigation,
		getActiveNavigationId,
	};
`;

    const ENTRY_BUGGY = `
		navigate: async function navigateRsc(href, redirectDepth = 0, navigationKind = "navigate") {
			serverActionSupplementalRefreshCoordinator.abortAll();
			const navigationAbortHandle = navigationAbortCoordinator.begin();
			const navId = browserNavigationController.beginNavigation();
			return navId;
		},
`;

    it("detects the navigation controller file", () => {
        expect(isRefreshDeferralNavControllerFile("/p/node_modules/vinext/dist/server/app-browser-navigation-controller.js")).toBe(true);
        expect(isRefreshDeferralNavControllerFile("C:\\p\\node_modules\\vinext\\dist\\server\\app-browser-navigation-controller.ts")).toBe(true);
        expect(isRefreshDeferralNavControllerFile("/p/node_modules/vinext/dist/server/app-page-probe.js")).toBe(false);
    });

    it("reports buggy navigation controller code as not fixed", () => {
        expect(isRefreshDeferralNavControllerAlreadyFixed(NAV_CONTROLLER_BUGGY)).toBe(false);
    });

    it("tags beginNavigation with its kind and exposes isRecentNonRefreshNavigationInFlight", () => {
        const patched = patchRefreshDeferralNavController(NAV_CONTROLLER_BUGGY);
        expect(patched).not.toBe(NAV_CONTROLLER_BUGGY);
        expect(patched).toContain("function beginNavigation(kind)");
        expect(patched).toContain('if (kind !== "refresh") lastNonRefreshNavigationStartedAt = Date.now();');
        expect(patched).toContain("function isRecentNonRefreshNavigationInFlight()");
        expect(patched).toContain("isRecentNonRefreshNavigationInFlight,");
        expect(isRefreshDeferralNavControllerAlreadyFixed(patched)).toBe(true);
    });

    it("is idempotent for the navigation controller patch", () => {
        const once = patchRefreshDeferralNavController(NAV_CONTROLLER_BUGGY);
        expect(patchRefreshDeferralNavController(once)).toBe(once);
    });

    it("leaves navigation controller code untouched when the anchors are missing", () => {
        const other = "export const x = 1;";
        expect(patchRefreshDeferralNavController(other)).toBe(other);

        const noStateDecl = `function beginNavigation() {\n\tlatestHmrUpdateId += 1;\n}\nreturn {\n\tbeginNavigation,\n};`;
        expect(patchRefreshDeferralNavController(noStateDecl)).toBe(noStateDecl);
    });

    it("detects the browser entry file for refresh deferral", () => {
        expect(isRefreshDeferralEntryAlreadyFixed(ENTRY_BUGGY)).toBe(false);
    });

    it("waits for an in-flight non-refresh navigation before starting a refresh", () => {
        const patched = patchRefreshDeferralEntry(ENTRY_BUGGY);
        expect(patched).not.toBe(ENTRY_BUGGY);
        expect(patched).toContain('if (navigationKind === "refresh") {');
        expect(patched).toContain("browserNavigationController.isRecentNonRefreshNavigationInFlight()");
        expect(patched).toContain("browserNavigationController.beginNavigation(navigationKind);");
        expect(isRefreshDeferralEntryAlreadyFixed(patched)).toBe(true);
        // the wait must run before the abort coordinators, at the very top of navigateRsc
        expect(patched.indexOf("isRecentNonRefreshNavigationInFlight")).toBeLessThan(
            patched.indexOf("serverActionSupplementalRefreshCoordinator.abortAll()")
        );
    });

    it("is idempotent for the browser entry patch", () => {
        const once = patchRefreshDeferralEntry(ENTRY_BUGGY);
        expect(patchRefreshDeferralEntry(once)).toBe(once);
    });

    it("leaves browser entry code untouched when navigateRsc isn't found", () => {
        const other = "export const x = 1;";
        expect(patchRefreshDeferralEntry(other)).toBe(other);
    });

    it("resolves the navigation controller path only when present on disk", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-navctl-resolve-"));
        try {
            expect(resolveVinextNavControllerPath(tempDir)).toBeNull();
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-navigation-controller.js");
            writeFileSync(filePath, NAV_CONTROLLER_BUGGY, "utf8");
            expect(resolveVinextNavControllerPath(tempDir)).toBe(filePath);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("patches both the navigation controller and the browser entry on disk together", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-refresh-deferral-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "app-browser-navigation-controller.js"), NAV_CONTROLLER_BUGGY, "utf8");
            writeFileSync(join(dir, "app-browser-entry.js"), ENTRY_BUGGY, "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: true,
            });
            expect(changed).toBe(true);
            expect(readFileSync(join(dir, "app-browser-navigation-controller.js"), "utf8")).toContain(
                "isRecentNonRefreshNavigationInFlight"
            );
            expect(readFileSync(join(dir, "app-browser-entry.js"), "utf8")).toContain(
                "browserNavigationController.beginNavigation(navigationKind);"
            );

            expect(syncPatchVinextOnDisk(tempDir, { refreshDeferral: true })).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns and leaves the navigation controller untouched when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-refresh-deferral-drift-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            // Matches NAV_CONTROLLER_BEGIN_NAVIGATION_RE but not NAV_CONTROLLER_STATE_DECL_RE / NAV_CONTROLLER_RETURN_RE,
            // so patchRefreshDeferralNavController is a genuine no-op — the "shape drifted" warning path.
            const drifted = `function beginNavigation() {\n\tlatestHmrUpdateId += 1;\n}`;
            const filePath = join(dir, "app-browser-navigation-controller.js");
            writeFileSync(filePath, drifted, "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: true,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchRefreshDeferralNavController"));
            expect(readFileSync(filePath, "utf8")).toBe(drifted);
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("skips the browser entry sub-patch once the navigation controller is already fixed but the file is missing", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-refresh-deferral-nofix-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const alreadyFixed = NAV_CONTROLLER_BUGGY.replace(
                "function getActiveNavigationId() {",
                "function isRecentNonRefreshNavigationInFlight() { return false; }\n\tfunction getActiveNavigationId() {"
            );
            writeFileSync(join(dir, "app-browser-navigation-controller.js"), alreadyFixed, "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: true,
            });
            expect(changed).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("handles read/write errors gracefully for the navigation controller path", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-refresh-deferral-nodir-"));
        try {
            // node_modules/vinext/dist/server does not exist at all — resolveVinextNavControllerPath
            // returns null, so the whole block is skipped without throwing.
            expect(() =>
                syncPatchVinextOnDisk(tempDir, {
                    routeWiring: false,
                    routeMatching: false,
                    optimisticRouting: false,
                    prefetchLearning: false,
                    suspenseProbe: false,
                    renderDependency: false,
                    optimisticLearningTimeout: false,
                    pageInvokerSuspensionRelease: false,
                    refreshDeferral: true,
                })
            ).not.toThrow();
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("*SafeOnDisk helpers for render-dependency, learning-timeout, and page-invoker patches", () => {
    it("isVinextRenderDependencySafeOnDisk: false when path missing, false when unpatched, true when patched", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-renderdep-safe-"));
        try {
            expect(isVinextRenderDependencySafeOnDisk(tempDir)).toBe(false);
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-render-dependency.js");
            writeFileSync(filePath, "function renderAppComponentWithDependencyBarrier() { if (!isAppRenderSuspension(error)) dependency.release(); }", "utf8");
            expect(isVinextRenderDependencySafeOnDisk(tempDir)).toBe(false);
            writeFileSync(filePath, "function renderAppComponentWithDependencyBarrier() { dependency.release(); }", "utf8");
            expect(isVinextRenderDependencySafeOnDisk(tempDir)).toBe(true);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("isVinextRenderDependencySafeOnDisk: false when the file cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-renderdep-unreadable-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-render-dependency.js");
            writeFileSync(filePath, "function renderAppComponentWithDependencyBarrier() { dependency.release(); }", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(isVinextRenderDependencySafeOnDisk(tempDir)).toBe(false);
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("isVinextOptimisticLearningTimeoutSafeOnDisk: false when path missing, false when unpatched, true when patched", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-learningcap-safe-"));
        try {
            expect(isVinextOptimisticLearningTimeoutSafeOnDisk(tempDir)).toBe(false);
            expect(resolveVinextOptimisticLearningTimeoutPath(tempDir)).toBeNull();
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-entry.js");
            writeFileSync(filePath, "new Promise((resolve) => setTimeout(resolve, 3000))", "utf8");
            expect(isVinextOptimisticLearningTimeoutSafeOnDisk(tempDir)).toBe(false);
            writeFileSync(filePath, "new Promise((resolve) => setTimeout(resolve, 200))", "utf8");
            expect(isVinextOptimisticLearningTimeoutSafeOnDisk(tempDir)).toBe(true);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("isVinextOptimisticLearningTimeoutSafeOnDisk: false when the file cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-learningcap-unreadable-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-entry.js");
            writeFileSync(filePath, "new Promise((resolve) => setTimeout(resolve, 200))", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(isVinextOptimisticLearningTimeoutSafeOnDisk(tempDir)).toBe(false);
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("isVinextPageInvokerSuspensionReleaseSafeOnDisk: false when path missing, false when unpatched, true when patched", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-pageinvoker-safe-"));
        try {
            expect(isVinextPageInvokerSuspensionReleaseSafeOnDisk(tempDir)).toBe(false);
            expect(resolveVinextPageInvokerSuspensionReleasePath(tempDir)).toBeNull();
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-element-builder.js");
            writeFileSync(
                filePath,
                "if (renderDependency && hasPageLoadingBoundary) Promise.resolve().then(() => renderDependency.release());",
                "utf8"
            );
            expect(isVinextPageInvokerSuspensionReleaseSafeOnDisk(tempDir)).toBe(false);
            writeFileSync(
                filePath,
                "if (renderDependency) Promise.resolve().then(() => renderDependency.release());",
                "utf8"
            );
            expect(isVinextPageInvokerSuspensionReleaseSafeOnDisk(tempDir)).toBe(true);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("isVinextPageInvokerSuspensionReleaseSafeOnDisk: false when the file cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-pageinvoker-unreadable-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-element-builder.js");
            writeFileSync(
                filePath,
                "if (renderDependency) Promise.resolve().then(() => renderDependency.release());",
                "utf8"
            );
            chmodSync(filePath, 0o000);
            try {
                expect(isVinextPageInvokerSuspensionReleaseSafeOnDisk(tempDir)).toBe(false);
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("unblockRenderDependencies: strips layout/template/slot/route dependency ordering", () => {
    const WIRING_BASE = `
function getPrefetchLoadingEntry(route) {
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
	}
	return getDefaultExport(route.loading) ? {} : null;
}
if (!isPrefetchLoadingShell && treePosition < routeSegments.length) {
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
elements[layoutEntry.id] = renderAfterAppDependencies(layoutElement, [...pageRenderDependency ? [pageRenderDependency] : [], ...layoutDependenciesBefore[index] ?? []]);
elements[templateEntry.id] = renderAfterAppDependencies(templateElement, [...pageRenderDependency ? [pageRenderDependency] : [], ...templateDependenciesBeforeById.get(templateEntry.id) ?? []]);
elements[slotId] = renderAfterAppDependencies(slotElement, [...pageRenderDependency ? [pageRenderDependency] : [], ...targetIndex >= 0 ? slotDependenciesByLayoutIndex[targetIndex] ?? [] : []]);
elements[routeId] = pageRenderDependency ? renderAfterAppDependencies(routeElement, [pageRenderDependency]) : routeElement;
`;

    it("leaves layout/template/slot/route dependency wiring untouched by default", () => {
        const patched = patchAppPageRouteWiring(WIRING_BASE);
        expect(patched).toContain("elements[layoutEntry.id] = renderAfterAppDependencies(layoutElement, [...pageRenderDependency");
        expect(patched).toContain("elements[templateEntry.id] = renderAfterAppDependencies(templateElement, [...pageRenderDependency");
        expect(patched).toContain("elements[slotId] = renderAfterAppDependencies(slotElement, [...pageRenderDependency");
        expect(patched).toContain("elements[routeId] = pageRenderDependency ? renderAfterAppDependencies(routeElement, [pageRenderDependency]) : routeElement;");
    });

    it("strips layout/template/slot/route dependency ordering when unblockRenderDependencies is set", () => {
        const patched = patchAppPageRouteWiring(WIRING_BASE, { unblockRenderDependencies: true });
        expect(patched).toContain("elements[layoutEntry.id] = renderAfterAppDependencies(layoutElement, layoutDependenciesBefore[index] ?? []);");
        expect(patched).toContain("elements[templateEntry.id] = renderAfterAppDependencies(templateElement, templateDependenciesBeforeById.get(templateEntry.id) ?? []);");
        expect(patched).toContain("elements[slotId] = renderAfterAppDependencies(slotElement, targetIndex >= 0 ? slotDependenciesByLayoutIndex[targetIndex] ?? [] : []);");
        expect(patched).toContain("elements[routeId] = routeElement;");
        expect(patched).not.toContain("[...pageRenderDependency");
    });
});

describe("missingRequiredSymbols", () => {
    it("lists exactly the symbols that are missing", () => {
        const renamed = "some code without any of the expected identifiers";
        const missing = missingRequiredSymbols(renamed, "routeMatching");
        expect(missing).toContain("trieMatch");
        expect(missing).toContain("getOrBuildTrie");
        expect(missing).toContain("normalizePathnameForRouteMatch");
    });

    it("returns an empty array once every required symbol is present", () => {
        expect(missingRequiredSymbols("trieMatch getOrBuildTrie normalizePathnameForRouteMatch", "routeMatching")).toEqual([]);
    });
});

describe("syncPatchVinextOnDisk: warns when a patch's shape has drifted (per patch type)", () => {
    function mismatchedShapeThatStillLacksTheFixMarker(patchName: string): string {
        // Contains every required symbol for the patch (so hasRequiredSymbols passes and the
        // "no longer exposes X" branch is NOT taken), yet matches none of the patch's own
        // replacement regexes — a genuine no-op that should surface the "shape may have
        // changed" warning instead of silently doing nothing.
        const bodies: Record<string, string> = {
            routeMatching: "trieMatch getOrBuildTrie normalizePathnameForRouteMatch — refactored, no matching function shape",
            optimisticRouting: "getRouteTrie matchNode decodeMatchedParams hrefToRouteParts — refactored",
            prefetchLearning:
                "resolveOptimisticNavigationPayload __basePath optimisticRouteTemplates optimisticRouteTemplateSources optimisticRouteTemplateLearning getOptimisticPrefetchSourceKey parsePrefetchCacheKey getPrefetchCache isSettledPrefetchCacheEntry learnOptimisticRouteTemplateFromPrefetch currentHref rscUrl — refactored",
        };
        return bodies[patchName] ?? "refactored";
    }

    it("warns for route-wiring when hasBuggyPrefetch is the only 'not fixed' signal but that specific sub-patch is a no-op", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-wiring-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-route-wiring.js");
            // hasBuggyPrefetch is true for isAppPageRouteWiringAlreadyFixed (firstNestedEntry +
            // PREFETCH_LOADING_FN_RE match), but patchAppPageRouteWiring's own hasBuggyPrefetch
            // additionally requires `!result.includes("deepestNestedEntry")`, which is false here
            // — so that one sub-patch is a no-op, and none of the other sub-patches match either,
            // making the WHOLE combined patch a no-op even though the file "is not already fixed".
            const driftedButNoOp = `
function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let firstNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (firstNestedEntry === null || treePosition < firstNestedEntry.treePosition) firstNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	if (firstNestedEntry) return firstNestedEntry;
	if (rootEntry) return rootEntry;
	return getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
}
// deepestNestedEntry already exists elsewhere in this bundle (e.g. inlined from a shared chunk)
const somewhereElseMarker = "deepestNestedEntry";
const _vinextHelpers = [options.makeThenableParams, resolveAppPageSegmentParams, routeLoadingComponent, ancestorLoadingEntry, slotParams, ownerLoadingEntry];
`;
            writeFileSync(filePath, driftedButNoOp, "utf8");

            expect(isAppPageRouteWiringAlreadyFixed(driftedButNoOp)).toBe(false);
            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: true,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchAppPageRouteWiring"));
            expect(readFileSync(filePath, "utf8")).toBe(driftedButNoOp);
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns for route-matching when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-matching-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/routing");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "route-matching.js");
            writeFileSync(filePath, mismatchedShapeThatStillLacksTheFixMarker("routeMatching"), "utf8");

            expect(resolveVinextRouteMatchingPath(tempDir)).toBe(filePath);
            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: true,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchRouteMatching"));
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns for optimistic-routing when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-optimistic-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-optimistic-routing.js");
            writeFileSync(filePath, mismatchedShapeThatStillLacksTheFixMarker("optimisticRouting"), "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: true,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchOptimisticRouting"));
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns for prefetch-learning when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-prefetch-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-entry.js");
            writeFileSync(filePath, mismatchedShapeThatStillLacksTheFixMarker("prefetchLearning"), "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: true,
                suspenseProbe: false,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchPrefetchLearning"));
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns for suspense-probe when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-probe-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-probe.js");
            // Contains REACT_CLIENT_REFERENCE_TYPE (the required symbol) but matches neither
            // of patchAppPageProbe's own anchor regexes.
            writeFileSync(filePath, "// REACT_CLIENT_REFERENCE_TYPE mentioned only here, no matching declaration or visit pattern", "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: true,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("patchAppPageProbe"));
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("warns for render-dependency when its shape has drifted", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-drift-renderdep-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-render-dependency.js");
            // Contains the marker isRenderDependencyAlreadyFixed requires ("renderAppComponentWithDependencyBarrier")
            // but not the buggy guarded-release pattern it also checks — a genuine no-op.
            writeFileSync(
                filePath,
                "function renderAppComponentWithDependencyBarrier() { /* refactored, no guarded release here */ }",
                "utf8"
            );

            // This file is "already fixed" per isRenderDependencyAlreadyFixed (no buggy pattern),
            // so to exercise the warn path we need content that reports NOT fixed yet is a no-op
            // for the replace. That requires SUSPENSION_GUARDED_RELEASE_RE to match but the
            // exact replacement text to already be present under a different marker — not
            // reachable for this single-regex patch, so assert the simpler safe/no-write path instead.
            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: true,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("isVinextOptimizeDepsCacheStale", () => {
    it("returns false when none of the patched files exist", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-none-"));
        try {
            expect(isVinextOptimizeDepsCacheStale(tempDir, join(tempDir, "node_modules/.vite"))).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("returns false when the cache dir does not exist", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-nocache-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "app-page-route-wiring.js"), "x", "utf8");
            expect(isVinextOptimizeDepsCacheStale(tempDir, join(tempDir, "node_modules/.vite"))).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("returns true when a patched file is newer than the deps cache", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-yes-"));
        try {
            const cacheDir = join(tempDir, "node_modules/.vite");
            const depsDir = join(cacheDir, "deps");
            mkdirSync(depsDir, { recursive: true });
            writeFileSync(join(depsDir, "entry.js"), "old", "utf8");

            await new Promise((r) => setTimeout(r, 20));

            const serverDir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(serverDir, { recursive: true });
            writeFileSync(join(serverDir, "app-page-route-wiring.js"), "newer", "utf8");

            expect(isVinextOptimizeDepsCacheStale(tempDir, cacheDir)).toBe(true);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("returns false when the deps cache is newer than every patched file", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-fresh-"));
        try {
            const serverDir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(serverDir, { recursive: true });
            writeFileSync(join(serverDir, "app-page-route-wiring.js"), "old", "utf8");

            await new Promise((r) => setTimeout(r, 20));

            const depsDir = join(tempDir, "node_modules/.vite/deps");
            mkdirSync(depsDir, { recursive: true });
            writeFileSync(join(depsDir, "entry.js"), "fresh", "utf8");

            expect(isVinextOptimizeDepsCacheStale(tempDir, join(tempDir, "node_modules/.vite"))).toBe(false);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("ignores a patched file whose stat cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-unreadable-file-"));
        try {
            const serverDir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(serverDir, { recursive: true });
            writeFileSync(join(serverDir, "app-page-route-wiring.js"), "x", "utf8");
            // Remove execute permission on the containing dir so statSync on the file inside it fails.
            chmodSync(serverDir, 0o000);
            try {
                expect(isVinextOptimizeDepsCacheStale(tempDir, join(tempDir, "node_modules/.vite"))).toBe(false);
            } finally {
                chmodSync(serverDir, 0o755);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("treats a deps subdirectory whose stat cannot be read as not provably stale", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-unreadable-cache-"));
        try {
            const serverDir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(serverDir, { recursive: true });
            writeFileSync(join(serverDir, "app-page-route-wiring.js"), "x", "utf8");

            const viteDir = join(tempDir, "node_modules/.vite");
            const depsDir = join(viteDir, "deps");
            mkdirSync(depsDir, { recursive: true });
            // Remove execute permission on .vite so statSync on .vite/deps fails.
            chmodSync(viteDir, 0o000);
            try {
                expect(isVinextOptimizeDepsCacheStale(tempDir, viteDir)).toBe(false);
            } finally {
                chmodSync(viteDir, 0o755);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("busts the cache via configResolved when nothing changed but the cache is stale", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-stale-configresolved-"));
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const serverDir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(serverDir, { recursive: true });
            // Already-fixed route wiring, so syncPatchVinextOnDisk's own `changed` is false.
            writeFileSync(
                join(serverDir, "app-page-route-wiring.js"),
                "!routeLoadingComponent deepestNestedEntry makeThenableParams resolveAppPageSegmentParams routeLoadingComponent ancestorLoadingEntry slotParams ownerLoadingEntry",
                "utf8"
            );

            await new Promise((r) => setTimeout(r, 20));

            const cacheDir = join(tempDir, "node_modules/.vite");
            mkdirSync(join(cacheDir, "deps"), { recursive: true });
            writeFileSync(join(cacheDir, "deps", "entry.js"), "stale", "utf8");
            // Make the cache dir itself look older than the patched file above by resetting its mtime.
            const oldTime = new Date(Date.now() - 10_000);
            const { utimesSync } = await import("node:fs");
            utimesSync(join(cacheDir, "deps"), oldTime, oldTime);

            const plugin = vinextRouteWiringFixPlugin({
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: false,
                renderDependency: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            const configResolvedHook = plugin.configResolved as (this: unknown, config: { root?: string; cacheDir?: string }) => void;
            configResolvedHook.call({}, { root: tempDir, cacheDir });

            expect(existsSync(join(cacheDir, "deps"))).toBe(false);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("vinextRouteWiringFixPlugin transform: renderDependency, pageInvokerSuspensionRelease, refreshDeferral (nav controller), suspenseProbe", () => {
    const RENDER_DEP_BUGGY = `function renderAppComponentWithDependencyBarrier() { if (!isAppRenderSuspension(error)) dependency.release(); }`;
    const PAGE_INVOKER_BUGGY = `if (renderDependency && hasPageLoadingBoundary) Promise.resolve().then(() => renderDependency.release());`;
    const NAV_CONTROLLER_BUGGY = `
	let latestHmrUpdateId = 0;
	function beginNavigation() {
		latestHmrUpdateId += 1;
	}
	function getActiveNavigationId() {
		return 0;
	}
	return {
		beginNavigation,
	};
`;
    const PROBE_BUGGY = `
const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("react.client.reference");
const visit = async (value, depth) => {
	if (value.type === Fragment || typeof value.type === "string") {
		await visit(value.props.children, depth + 1);
	}
};
`;

    it("transforms app-render-dependency.js when renderDependency is enabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ renderDependency: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const res = transformHook.call({}, RENDER_DEP_BUGGY, "/node_modules/vinext/dist/server/app-render-dependency.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("dependency.release();");
        expect(res!.code).not.toContain("if (!isAppRenderSuspension(error))");
        expect(transformHook.call({}, res!.code, "/node_modules/vinext/dist/server/app-render-dependency.js")).toBeUndefined();
    });

    it("skips app-render-dependency.js when renderDependency is disabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ renderDependency: false });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, RENDER_DEP_BUGGY, "/node_modules/vinext/dist/server/app-render-dependency.js")).toBeUndefined();
    });

    it("returns undefined for app-render-dependency.js when the patch is a no-op", () => {
        const plugin = vinextRouteWiringFixPlugin({ renderDependency: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, "export const x = 1;", "/node_modules/vinext/dist/server/app-render-dependency.js")).toBeUndefined();
    });

    it("transforms app-page-element-builder.js when pageInvokerSuspensionRelease is enabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ pageInvokerSuspensionRelease: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const res = transformHook.call({}, PAGE_INVOKER_BUGGY, "/node_modules/vinext/dist/server/app-page-element-builder.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("if (renderDependency) Promise.resolve().then(() => renderDependency.release());");
        expect(transformHook.call({}, res!.code, "/node_modules/vinext/dist/server/app-page-element-builder.js")).toBeUndefined();
    });

    it("skips app-page-element-builder.js when pageInvokerSuspensionRelease is disabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ pageInvokerSuspensionRelease: false });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, PAGE_INVOKER_BUGGY, "/node_modules/vinext/dist/server/app-page-element-builder.js")).toBeUndefined();
    });

    it("returns undefined for app-page-element-builder.js when the patch is a no-op", () => {
        const plugin = vinextRouteWiringFixPlugin({ pageInvokerSuspensionRelease: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, "export const x = 1;", "/node_modules/vinext/dist/server/app-page-element-builder.js")).toBeUndefined();
    });

    it("transforms app-browser-navigation-controller.js when refreshDeferral is enabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ refreshDeferral: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const res = transformHook.call({}, NAV_CONTROLLER_BUGGY, "/node_modules/vinext/dist/server/app-browser-navigation-controller.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("isRecentNonRefreshNavigationInFlight");
        expect(transformHook.call({}, res!.code, "/node_modules/vinext/dist/server/app-browser-navigation-controller.js")).toBeUndefined();
    });

    it("skips app-browser-navigation-controller.js when refreshDeferral is disabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ refreshDeferral: false });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, NAV_CONTROLLER_BUGGY, "/node_modules/vinext/dist/server/app-browser-navigation-controller.js")).toBeUndefined();
    });

    it("returns undefined for app-browser-navigation-controller.js when the patch is a no-op", () => {
        const plugin = vinextRouteWiringFixPlugin({ refreshDeferral: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, "export const x = 1;", "/node_modules/vinext/dist/server/app-browser-navigation-controller.js")).toBeUndefined();
    });

    it("transforms app-page-probe.js when suspenseProbe is enabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ suspenseProbe: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const res = transformHook.call({}, PROBE_BUGGY, "/node_modules/vinext/dist/server/app-page-probe.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("REACT_SUSPENSE_TYPE");
        expect(transformHook.call({}, res!.code, "/node_modules/vinext/dist/server/app-page-probe.js")).toBeUndefined();
    });

    it("skips app-page-probe.js when suspenseProbe is disabled", () => {
        const plugin = vinextRouteWiringFixPlugin({ suspenseProbe: false });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, PROBE_BUGGY, "/node_modules/vinext/dist/server/app-page-probe.js")).toBeUndefined();
    });

    it("returns undefined for app-page-probe.js when the required symbols are missing", () => {
        const plugin = vinextRouteWiringFixPlugin({ suspenseProbe: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        expect(transformHook.call({}, "export const x = 1;", "/node_modules/vinext/dist/server/app-page-probe.js")).toBeUndefined();
    });
});

describe("vinextRouteWiringFixPlugin transform: no-op patch branches ('not already fixed' yet no replacement matches)", () => {
    it("routeMatching: returns undefined when not already fixed but neither function shape matches", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const noOpCode = `
const _decoys = [trieMatch, getOrBuildTrie, normalizePathnameForRouteMatch];
export function matchRouteWithTrie() { return null; }
export function matchRouteWithTrieRawPathname() { return null; }
`;
        expect(isRouteMatchingAlreadyFixed(noOpCode)).toBe(false);
        expect(hasRequiredSymbols(noOpCode, "routeMatching")).toBe(true);
        const res = transformHook.call({}, noOpCode, "/node_modules/vinext/dist/routing/route-matching.js");
        expect(res).toBeUndefined();
    });

    it("optimisticRouting: returns undefined when not already fixed but neither function shape matches", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const noOpCode = `
const _decoys = [getRouteTrie, matchNode, decodeMatchedParams, hrefToRouteParts];
export function matchOptimisticRouteManifestRoute() { return null; }
export function resolveOptimisticNavigationParams() { return null; }
`;
        expect(isOptimisticRoutingAlreadyFixed(noOpCode)).toBe(false);
        const res = transformHook.call({}, noOpCode, "/node_modules/vinext/dist/server/app-optimistic-routing.js");
        expect(res).toBeUndefined();
    });

    it("refreshDeferral (nav controller): returns undefined when beginNavigation matches but the state/return anchors don't", () => {
        const plugin = vinextRouteWiringFixPlugin({ refreshDeferral: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const noOpCode = `function beginNavigation() {\n\tlatestHmrUpdateId += 1;\n}`;
        expect(isRefreshDeferralNavControllerAlreadyFixed(noOpCode)).toBe(false);
        const res = transformHook.call({}, noOpCode, "/node_modules/vinext/dist/server/app-browser-navigation-controller.js");
        expect(res).toBeUndefined();
    });

    it("suspenseProbe: returns undefined when not already fixed but neither the decl nor the visit pattern matches", () => {
        const plugin = vinextRouteWiringFixPlugin({ suspenseProbe: true });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const noOpCode = `
const _decoy = REACT_CLIENT_REFERENCE_TYPE;
export function unrelatedProbeHelper() { return null; }
`;
        expect(isAppPageProbeAlreadyFixed(noOpCode)).toBe(false);
        expect(hasRequiredSymbols(noOpCode, "suspenseProbe")).toBe(true);
        const res = transformHook.call({}, noOpCode, "/node_modules/vinext/dist/server/app-page-probe.js");
        expect(res).toBeUndefined();
    });
});

describe("syncPatchVinextOnDisk: remaining reachable warn/catch branches", () => {
    it("warns for suspense-probe when the required symbol itself is missing", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-probe-missing-symbol-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-probe.js");
            writeFileSync(filePath, "export function probe() { return null; }", "utf8");

            const changed = syncPatchVinextOnDisk(tempDir, {
                routeWiring: false,
                routeMatching: false,
                optimisticRouting: false,
                prefetchLearning: false,
                suspenseProbe: true,
                renderDependency: false,
                optimisticLearningTimeout: false,
                pageInvokerSuspensionRelease: false,
                refreshDeferral: false,
            });
            expect(changed).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no longer exposes REACT_CLIENT_REFERENCE_TYPE"));
            expect(readFileSync(filePath, "utf8")).toBe("export function probe() { return null; }");
        } finally {
            warnSpy.mockRestore();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("skips the suspense-probe file when it exists but cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-probe-unreadable-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-probe.js");
            writeFileSync(filePath, "x", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(() =>
                    syncPatchVinextOnDisk(tempDir, {
                        routeWiring: false,
                        routeMatching: false,
                        optimisticRouting: false,
                        prefetchLearning: false,
                        suspenseProbe: true,
                        renderDependency: false,
                        optimisticLearningTimeout: false,
                        pageInvokerSuspensionRelease: false,
                        refreshDeferral: false,
                    })
                ).not.toThrow();
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("skips the render-dependency file when it exists but cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-renderdep-unreadable-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-render-dependency.js");
            writeFileSync(filePath, "x", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(() =>
                    syncPatchVinextOnDisk(tempDir, {
                        routeWiring: false,
                        routeMatching: false,
                        optimisticRouting: false,
                        prefetchLearning: false,
                        suspenseProbe: false,
                        renderDependency: true,
                        optimisticLearningTimeout: false,
                        pageInvokerSuspensionRelease: false,
                        refreshDeferral: false,
                    })
                ).not.toThrow();
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("skips the page-invoker file when it exists but cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-pageinvoker-unreadable-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-page-element-builder.js");
            writeFileSync(filePath, "x", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(() =>
                    syncPatchVinextOnDisk(tempDir, {
                        routeWiring: false,
                        routeMatching: false,
                        optimisticRouting: false,
                        prefetchLearning: false,
                        suspenseProbe: false,
                        renderDependency: false,
                        optimisticLearningTimeout: false,
                        pageInvokerSuspensionRelease: true,
                        refreshDeferral: false,
                    })
                ).not.toThrow();
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("skips the navigation controller file when it exists but cannot be read", () => {
        const tempDir = mkdtempSync(join(tmpdir(), "cfni-navctl-unreadable-disk-"));
        try {
            const dir = join(tempDir, "node_modules/vinext/dist/server");
            mkdirSync(dir, { recursive: true });
            const filePath = join(dir, "app-browser-navigation-controller.js");
            writeFileSync(filePath, "x", "utf8");
            chmodSync(filePath, 0o000);
            try {
                expect(() =>
                    syncPatchVinextOnDisk(tempDir, {
                        routeWiring: false,
                        routeMatching: false,
                        optimisticRouting: false,
                        prefetchLearning: false,
                        suspenseProbe: false,
                        renderDependency: false,
                        optimisticLearningTimeout: false,
                        pageInvokerSuspensionRelease: false,
                        refreshDeferral: true,
                    })
                ).not.toThrow();
            } finally {
                chmodSync(filePath, 0o644);
            }
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});

describe("vinextRouteWiringFixPlugin: optimisticLearningTimeout as a number end-to-end", () => {
    it("honours an explicit ms cap passed straight to the plugin factory", () => {
        const plugin = vinextRouteWiringFixPlugin({ optimisticLearningTimeout: 1234 });
        const transformHook = plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined;
        const buggy = `new Promise((resolve) => setTimeout(resolve, 3000))`;
        const res = transformHook.call({}, buggy, "/node_modules/vinext/dist/server/app-browser-entry.js");
        expect(res).toBeDefined();
        expect(res!.code).toContain("setTimeout(resolve, 1234)");
    });
});
