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
    /function\s+matchOptimisticRouteManifestRoute\s*\(\s*options\s*\)\s*\{[\s\S]*?getRouteTrie\([\s\S]*?\)[\s\S]*?\n\}/;

const FIXED_MATCH_OPTIMISTIC_ROUTE = `function getActiveRouteLocale() {
	return (typeof document !== "undefined" && (document.documentElement?.lang || document.cookie.match(/__user_locale_key__=([^;]+)/)?.[1])) || (typeof window !== "undefined" && window.__VINEXT_LOCALE__) || "en";
}
function matchOptimisticRouteManifestRoute(options) {
	const urlParts = hrefToRouteParts(options.href, options.basePath);
	if (urlParts === null) return null;
	const trie = getRouteTrie(options.routeManifest);
	const hasLeadingLocaleParam = Array.from(options.routeManifest?.segmentGraph?.routes?.values() ?? []).some((r) => r.patternParts?.[0] === ":locale");
	if (hasLeadingLocaleParam) {
		const activeLocale = getActiveRouteLocale();
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

export function isPrefetchLearningFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-browser-entry.js") || cleanId.endsWith("/app-browser-entry.ts");
}

export function isPrefetchLearningAlreadyFixed(code: string): boolean {
    return code.includes("targetRscUrl");
}

const LEARN_TEMPLATES_FN_RE =
    /async\s+function\s+learnOptimisticRouteTemplatesFromPrefetchCache\s*\(\s*options\s*\)\s*\{[\s\S]*?await\s+Promise\.allSettled\(\s*learning\s*\);\s*\}/;

const FIXED_LEARN_TEMPLATES_FN = `async function learnOptimisticRouteTemplatesFromPrefetchCache(options) {
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
		if (entry.prefetchKind === "route-tree") continue;
		const isPendingNavigationTarget = !isSettledPrefetchCacheEntry(entry) && entry.pending !== void 0 && options.targetRscUrl !== void 0 && parsePrefetchCacheKey(cacheKey).rscUrl === options.targetRscUrl;
		if (!isSettledPrefetchCacheEntry(entry) && !isPendingNavigationTarget) continue;
		const promise = (async () => {
			let settledEntry = entry;
			if (!isSettledPrefetchCacheEntry(settledEntry)) {
				await settledEntry.pending?.catch(() => {});
				settledEntry = getPrefetchCache().get(cacheKey) ?? settledEntry;
				if (!isSettledPrefetchCacheEntry(settledEntry)) return;
			}
			return learnOptimisticRouteTemplateFromPrefetch({
				cacheKey,
				entry: settledEntry,
				interceptionContext: options.interceptionContext,
				mountedSlotsHeader: options.mountedSlotsHeader,
				routeManifest: options.routeManifest
			});
		})().then((learned) => {
			if (learned) optimisticRouteTemplateSources.add(sourceKey);
		}).finally(() => {
			optimisticRouteTemplateLearning.delete(sourceKey);
		});
		optimisticRouteTemplateLearning.set(sourceKey, promise);
		learning.push(promise);
	}
	if (learning.length === 0) return;
	await Promise.allSettled(learning);
}`;

const LEARN_TEMPLATES_CALL_RE =
    /(await\s+learnOptimisticRouteTemplatesFromPrefetchCache\(\s*\{\s*)interceptionContext:\s*requestInterceptionContext,/;

const FIXED_LEARN_TEMPLATES_CALL = "$1interceptionContext: requestInterceptionContext,\n\t\t\t\t\t\t\ttargetRscUrl: rscUrl,";

/**
 * Patches Vinext's browser entry so a navigation whose target prefetch is still
 * IN FLIGHT waits for that one prefetch before giving up on the optimistic route
 * shell.
 *
 * Upstream only learns optimistic templates from prefetch entries that have
 * already settled. A link prefetched on hover/pointerdown is normally still
 * pending when the click lands, so there is no template to commit and the
 * PREVIOUS page stays on screen until the full navigation response arrives —
 * the target route's `loading.tsx` never gets a chance to paint. Only the entry
 * matching the navigation target is awaited (it is a loading-shell prefetch, so
 * it resolves well before the navigation response), never every pending entry.
 */
export function patchPrefetchLearning(code: string): string {
    if (isPrefetchLearningAlreadyFixed(code)) {
        return code;
    }

    let result = code;
    if (LEARN_TEMPLATES_FN_RE.test(result)) {
        result = result.replace(LEARN_TEMPLATES_FN_RE, FIXED_LEARN_TEMPLATES_FN);
    }
    if (LEARN_TEMPLATES_CALL_RE.test(result)) {
        result = result.replace(LEARN_TEMPLATES_CALL_RE, FIXED_LEARN_TEMPLATES_CALL);
    }
    return result;
}

export function resolveVinextBrowserEntryPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-browser-entry.js");
    return existsSync(directPath) ? directPath : null;
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
    prefetchLearning?: boolean;
}

export function syncPatchVinextOnDisk(root: string = process.cwd(), options: SyncPatchVinextOnDiskOptions = {}): boolean {
    const { routeWiring = true, routeMatching = true, optimisticRouting = true, prefetchLearning = true } = options;
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

    const browserEntryPath = prefetchLearning ? resolveVinextBrowserEntryPath(root) : null;
    if (browserEntryPath) {
        try {
            const content = readFileSync(browserEntryPath, "utf8");
            if (!isPrefetchLearningAlreadyFixed(content)) {
                const patched = patchPrefetchLearning(content);
                if (patched !== content) {
                    writeFileSync(browserEntryPath, patched, "utf8");
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

    /**
     * Fix optimistic route-shell learning so a navigation whose target prefetch is
     * still in flight waits for it, instead of falling back to the full navigation
     * response and leaving the previous page on screen.
     * @default true
     */
    prefetchLearning?: boolean;
}

export function vinextRouteWiringFixPlugin(options: VinextRouteWiringFixPluginOptions = {}): Plugin {
    const routeWiring = options.routeWiring !== false;
    const routeMatching = options.routeMatching !== false;
    const optimisticRouting = options.optimisticRouting !== false;
    const prefetchLearning = options.prefetchLearning !== false;

    return {
        name: "cfni:vinext-route-wiring-fix",
        enforce: "pre",
        configResolved(config) {
            const root = config.root || process.cwd();
            syncPatchVinextOnDisk(root, { routeWiring, routeMatching, optimisticRouting, prefetchLearning });
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
            if (prefetchLearning && isPrefetchLearningFile(id)) {
                if (isPrefetchLearningAlreadyFixed(code)) {
                    return;
                }
                const patched = patchPrefetchLearning(code);
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


