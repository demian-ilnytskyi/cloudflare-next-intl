import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    patchAppPageRouteWiring,
    isAppPageRouteWiringFile,
    isAppPageRouteWiringAlreadyFixed,
    patchRouteMatching,
    isRouteMatchingFile,
    isRouteMatchingAlreadyFixed,
    resolveVinextRouteMatchingPath,
    isOptimisticRoutingFile,
    isOptimisticRoutingAlreadyFixed,
    patchOptimisticRouting,
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


    it("matches .ts and .tsx file variants", () => {
        expect(isAppPageRouteWiringFile("/dir/app-page-route-wiring.tsx")).toBe(true);
        expect(isAppPageRouteWiringFile("/dir/app-page-route-wiring.ts")).toBe(true);
    });

    it("runs syncPatchVinextOnDisk in configResolved hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        expect(typeof plugin.configResolved).toBe("function");
        expect(() => {
            (plugin.configResolved as any)({ root: "/non-existent-directory" });
        }).not.toThrow();
        expect(() => {
            (plugin.configResolved as any)({});
        }).not.toThrow();
    });
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    resolveVinextAppPageRouteWiringPath,
    syncPatchVinextOnDisk,
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
});

describe("vinextRouteWiringFixPlugin with route matching", () => {
    it("transforms route-matching.js via plugin transform hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as Function;

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
});

describe("vinextRouteWiringFixPlugin with optimistic routing", () => {
    it("transforms app-optimistic-routing.js via plugin transform hook", () => {
        const plugin = vinextRouteWiringFixPlugin();
        const transformHook = plugin.transform as Function;

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


