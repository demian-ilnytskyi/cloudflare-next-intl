import type { Plugin } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PREFETCH_LOADING_FN_RE =
    /function\s+getPrefetchLoadingEntry\s*\(\s*route\s*\)\s*\{[\s\S]*?return\s+getDefaultExport\s*\(\s*route\.loading\s*\)\s*\?[\s\S]*?:\s*null\s*;\s*\}/;

const FIXED_PREFETCH_LOADING_FN = `function getPrefetchLoadingEntry(route) {
	let rootEntry = null;
	let deepestNestedEntry = null;
	for (const [index, loadingModule] of (route.loadings ?? []).entries()) {
		if (!getDefaultExport(loadingModule)) continue;
		const treePosition = route.loadingTreePositions?.[index];
		if (treePosition === void 0) continue;
		if (treePosition === 0) rootEntry ??= {
			loadingModule,
			treePosition
		};
		else if (deepestNestedEntry === null || treePosition > deepestNestedEntry.treePosition) deepestNestedEntry = {
			loadingModule,
			treePosition
		};
	}
	const leafEntry = getDefaultExport(route.loading) ? {
		loadingModule: route.loading,
		treePosition: route.routeSegments?.length ?? 0
	} : null;
	if (leafEntry && (!deepestNestedEntry || leafEntry.treePosition >= deepestNestedEntry.treePosition)) return leafEntry;
	if (deepestNestedEntry) return deepestNestedEntry;
	if (rootEntry) return rootEntry;
	return null;
}`;

const ROUTE_LOADING_GUARD_RE =
    /if\s*\(\s*!isPrefetchLoadingShell\s*&&\s*treePosition\s*<\s*routeSegments\.length\s*\)\s*\{/g;

const FIXED_ROUTE_LOADING_GUARD =
    "if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {";

/**
 * Checks if the route wiring method is already fixed (either patched or fixed upstream).
 * If already fixed, the plugin will make no modifications.
 */
export function isAppPageRouteWiringAlreadyFixed(code: string): boolean {
    const hasBuggyPrefetch = code.includes("firstNestedEntry") && PREFETCH_LOADING_FN_RE.test(code);
    const hasBuggySuspense = !code.includes("!routeLoadingComponent") && ROUTE_LOADING_GUARD_RE.test(code);
    return !hasBuggyPrefetch && !hasBuggySuspense;
}

/**
 * Patches Vinext's app-page-route-wiring to:
 * 1. Pick the leaf route loading or deepest nested loading for prefetch loading shells
 *    instead of the shallowest/root loading module.
 * 2. Guard nested layout Suspense wrappers so routes with their own loading boundary
 *    aren't incorrectly wrapped by ancestor fallback loading shells during full navigation.
 *
 * If the method is already fixed or does not exhibit the buggy pattern, it leaves the code untouched.
 */
export function patchAppPageRouteWiring(code: string): string {
    if (isAppPageRouteWiringAlreadyFixed(code)) {
        return code;
    }

    let result = code;

    const hasBuggyPrefetch = code.includes("firstNestedEntry") && PREFETCH_LOADING_FN_RE.test(code);
    if (hasBuggyPrefetch && !result.includes("deepestNestedEntry")) {
        result = result.replace(PREFETCH_LOADING_FN_RE, FIXED_PREFETCH_LOADING_FN);
    }

    const hasBuggySuspense = !result.includes("!routeLoadingComponent") && ROUTE_LOADING_GUARD_RE.test(result);
    if (hasBuggySuspense) {
        result = result.replace(ROUTE_LOADING_GUARD_RE, FIXED_ROUTE_LOADING_GUARD);
    }

    return result;
}

export function isRouteMatchingFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/routing/route-matching.js") || cleanId.endsWith("/routing/route-matching.ts");
}

export function isRouteMatchingAlreadyFixed(code: string): boolean {
    return code.includes("hasLeadingLocaleParam");
}

const MATCH_ROUTE_WITH_TRIE_RE =
    /function\s+matchRouteWithTrie\s*\(\s*url\s*,\s*routes\s*,\s*cache\s*\)\s*\{[\s\S]*?return\s+trieMatch\([\s\S]*?\);\s*\}/;

const FIXED_MATCH_ROUTE_WITH_TRIE = `function getActiveRouteLocale() {
	return (typeof document !== "undefined" && (document.documentElement?.lang || document.cookie.match(/__user_locale_key__=([^;]+)/)?.[1])) || (typeof window !== "undefined" && window.__VINEXT_LOCALE__) || "en";
}
function matchRouteWithTrie(url, routes, cache) {
	const pathname = url.split("?")[0];
	let normalizedUrl = pathname === "/" ? "/" : pathname.replace(/\\/$/, "");
	normalizedUrl = normalizePathnameForRouteMatch(normalizedUrl);
	const urlParts = normalizedUrl.split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	const hasLeadingLocaleParam = routes.some((r) => r.patternParts?.[0] === ":locale");
	if (hasLeadingLocaleParam) {
		const activeLocale = getActiveRouteLocale();
		if (urlParts[0] !== activeLocale) {
			const matchWithLocale = trieMatch(trie, [activeLocale, ...urlParts]);
			if (matchWithLocale) return matchWithLocale;
		}
	}
	return trieMatch(trie, urlParts);
}`;

const MATCH_ROUTE_WITH_TRIE_RAW_RE =
    /function\s+matchRouteWithTrieRawPathname\s*\(\s*url\s*,\s*routes\s*,\s*cache\s*\)\s*\{[\s\S]*?return\s+trieMatch\([\s\S]*?\);\s*\}/;

const FIXED_MATCH_ROUTE_WITH_TRIE_RAW = `function matchRouteWithTrieRawPathname(url, routes, cache) {
	const pathname = url.split("?")[0];
	const urlParts = (pathname === "/" ? "/" : pathname.replace(/\\/$/, "")).split("/").filter(Boolean);
	const trie = getOrBuildTrie(cache, routes);
	const hasLeadingLocaleParam = routes.some((r) => r.patternParts?.[0] === ":locale");
	if (hasLeadingLocaleParam) {
		const activeLocale = getActiveRouteLocale();
		if (urlParts[0] !== activeLocale) {
			const matchWithLocale = trieMatch(trie, [activeLocale, ...urlParts]);
			if (matchWithLocale) return matchWithLocale;
		}
	}
	return trieMatch(trie, urlParts);
}`;

export function patchRouteMatching(code: string): string {
    if (isRouteMatchingAlreadyFixed(code)) {
        return code;
    }

    let result = code;
    if (MATCH_ROUTE_WITH_TRIE_RE.test(result)) {
        result = result.replace(MATCH_ROUTE_WITH_TRIE_RE, FIXED_MATCH_ROUTE_WITH_TRIE);
    }
    if (MATCH_ROUTE_WITH_TRIE_RAW_RE.test(result)) {
        result = result.replace(MATCH_ROUTE_WITH_TRIE_RAW_RE, FIXED_MATCH_ROUTE_WITH_TRIE_RAW);
    }
    return result;
}

export function isOptimisticRoutingFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-optimistic-routing.js") || cleanId.endsWith("/app-optimistic-routing.ts");
}

export function isOptimisticRoutingAlreadyFixed(code: string): boolean {
    const hasLocalePrefixFirst = code.includes("hasLeadingLocaleParam") &&
        code.indexOf("hasLeadingLocaleParam") < code.indexOf("const match = matchNode(trie, urlParts.normalized");
    const hasRawPartsFix = code.includes("options.rawUrlParts[0] !== options.match.params.locale");
    return hasLocalePrefixFirst && hasRawPartsFix;
}

const MATCH_OPTIMISTIC_ROUTE_RE =
    /function\s+matchOptimisticRouteManifestRoute\s*\(\s*options\s*\)\s*\{[\s\S]*?const\s+trie\s*=\s*getRouteTrie\([\s\S]*?\);[\s\S]*?const\s+match\s*=\s*matchNode\([\s\S]*?\);[\s\S]*?return\s+null;\s*\}/;

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

const RESOLVE_OPTIMISTIC_NAV_PARAMS_RE =
    /function\s+resolveOptimisticNavigationParams\s*\(\s*options\s*\)\s*\{[\s\S]*?const\s+routeParams\s*=\s*extractRawRoutePatternParams\s*\(\s*options\.match\.route\.patternParts\s*,\s*options\.rawUrlParts\s*\);/;

const FIXED_RESOLVE_OPTIMISTIC_NAV_PARAMS = `function resolveOptimisticNavigationParams(options) {
	const rawParts = (options.match.route.patternParts?.[0] === ":locale" && options.rawUrlParts[0] !== options.match.params.locale)
		? [options.match.params.locale, ...options.rawUrlParts]
		: options.rawUrlParts;
	const routeParams = extractRawRoutePatternParams(options.match.route.patternParts, rawParts);`;

export function patchOptimisticRouting(code: string): string {
    if (isOptimisticRoutingAlreadyFixed(code)) {
        return code;
    }

    let result = code;
    if (MATCH_OPTIMISTIC_ROUTE_RE.test(result)) {
        result = result.replace(MATCH_OPTIMISTIC_ROUTE_RE, FIXED_MATCH_OPTIMISTIC_ROUTE);
    }
    if (RESOLVE_OPTIMISTIC_NAV_PARAMS_RE.test(result)) {
        result = result.replace(RESOLVE_OPTIMISTIC_NAV_PARAMS_RE, FIXED_RESOLVE_OPTIMISTIC_NAV_PARAMS);
    }
    return result;
}

export function isAppPageRouteWiringFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-page-route-wiring.js") || cleanId.endsWith("/app-page-route-wiring.tsx") || cleanId.endsWith("/app-page-route-wiring.ts");
}

export function resolveVinextAppPageRouteWiringPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-page-route-wiring.js");
    return existsSync(directPath) ? directPath : null;
}

export function resolveVinextRouteMatchingPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/routing/route-matching.js");
    return existsSync(directPath) ? directPath : null;
}

export function resolveVinextOptimisticRoutingPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-optimistic-routing.js");
    return existsSync(directPath) ? directPath : null;
}

export interface SyncPatchVinextOnDiskOptions {
    routeWiring?: boolean;
    routeMatching?: boolean;
    optimisticRouting?: boolean;
}

export function syncPatchVinextOnDisk(root: string = process.cwd(), options: SyncPatchVinextOnDiskOptions = {}): boolean {
    const { routeWiring = true, routeMatching = true, optimisticRouting = true } = options;
    let changed = false;

    const wiringPath = routeWiring ? resolveVinextAppPageRouteWiringPath(root) : null;
    if (wiringPath) {
        try {
            const content = readFileSync(wiringPath, "utf8");
            if (!isAppPageRouteWiringAlreadyFixed(content)) {
                const patched = patchAppPageRouteWiring(content);
                if (patched !== content) {
                    writeFileSync(wiringPath, patched, "utf8");
                    changed = true;
                }
            }
        } catch {
            // Failed read/write
        }
    }

    const matchingPath = routeMatching ? resolveVinextRouteMatchingPath(root) : null;
    if (matchingPath) {
        try {
            const content = readFileSync(matchingPath, "utf8");
            if (!isRouteMatchingAlreadyFixed(content)) {
                const patched = patchRouteMatching(content);
                if (patched !== content) {
                    writeFileSync(matchingPath, patched, "utf8");
                    changed = true;
                }
            }
        } catch {
            // Failed read/write
        }
    }

    const optimisticPath = optimisticRouting ? resolveVinextOptimisticRoutingPath(root) : null;
    if (optimisticPath) {
        try {
            const content = readFileSync(optimisticPath, "utf8");
            if (!isOptimisticRoutingAlreadyFixed(content)) {
                const patched = patchOptimisticRouting(content);
                if (patched !== content) {
                    writeFileSync(optimisticPath, patched, "utf8");
                    changed = true;
                }
            }
        } catch {
            // Failed read/write
        }
    }

    return changed;
}

export interface VinextRouteWiringFixPluginOptions {
    /**
     * Fix prefetch loading shell and nested route Suspense boundary wiring so
     * route-specific loading boundaries take precedence over root/ancestor skeletons.
     * @default true
     */
    routeWiring?: boolean;

    /**
     * Fix route matching so a leading `:locale` segment is tried against the active
     * locale before falling back to a locale-less match.
     * @default true
     */
    routeMatching?: boolean;

    /**
     * Fix optimistic (client-side) routing so a leading `:locale` segment is tried
     * against the active locale before falling back to a locale-less match.
     * @default true
     */
    optimisticRouting?: boolean;
}

export function vinextRouteWiringFixPlugin(options: VinextRouteWiringFixPluginOptions = {}): Plugin {
    const routeWiring = options.routeWiring !== false;
    const routeMatching = options.routeMatching !== false;
    const optimisticRouting = options.optimisticRouting !== false;

    return {
        name: "cfni:vinext-route-wiring-fix",
        enforce: "pre",
        configResolved(config) {
            const root = config.root || process.cwd();
            syncPatchVinextOnDisk(root, { routeWiring, routeMatching, optimisticRouting });
        },
        transform(code, id) {
            if (routeWiring && isAppPageRouteWiringFile(id)) {
                if (isAppPageRouteWiringAlreadyFixed(code)) {
                    return;
                }
                const patched = patchAppPageRouteWiring(code);
                return {
                    code: patched,
                    map: null,
                };
            }
            if (routeMatching && isRouteMatchingFile(id)) {
                if (isRouteMatchingAlreadyFixed(code)) {
                    return;
                }
                const patched = patchRouteMatching(code);
                return {
                    code: patched,
                    map: null,
                };
            }
            if (optimisticRouting && isOptimisticRoutingFile(id)) {
                if (isOptimisticRoutingAlreadyFixed(code)) {
                    return;
                }
                const patched = patchOptimisticRouting(code);
                return {
                    code: patched,
                    map: null,
                };
            }
        },
    };
}


