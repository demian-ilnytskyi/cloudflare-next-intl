import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
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
    vinextRouteWiringFixPlugin,
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
import { join } from "node:path";
import {
    resolveVinextAppPageRouteWiringPath,
    syncPatchVinextOnDisk,
    bustVinextOptimizeDepsCache,
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

