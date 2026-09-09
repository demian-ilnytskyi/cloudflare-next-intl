import type { Plugin } from "vite";
import { existsSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PREFETCH_LOADING_FN_RE =
    /function\s+getPrefetchLoadingEntry\s*\(\s*route\s*\)\s*\{[\s\S]*?firstNestedEntry[\s\S]*?route\.loadings[\s\S]*?return\s+getDefaultExport\s*\(\s*route\.loading\s*\)\s*\?[\s\S]*?:\s*null\s*;\s*\}/;

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

// No /g: a global regex's `.test()` mutates `lastIndex` on the shared module-level
// object, so two `.test()` calls on the same string (one in the "already fixed?"
// check, one in the patch itself) can alternate true/false and silently skip a
// genuine match. `.replace()` doesn't need /g here — every known call site has at
// most one occurrence, and `replace` without /g still replaces the first match.
const ROUTE_LOADING_GUARD_RE =
    /if\s*\(\s*!isPrefetchLoadingShell\s*&&\s*treePosition\s*<\s*routeSegments\.length\s*\)\s*\{/;

const FIXED_ROUTE_LOADING_GUARD =
    "if (!isPrefetchLoadingShell && treePosition < routeSegments.length && !routeLoadingComponent) {";

const PAGE_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*PageLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_PAGE_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(PageLoadingComponent, { params: options.makeThenableParams(options.matchedParams) })";

const ANCESTOR_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*AncestorLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_ANCESTOR_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(AncestorLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, ancestorLoadingEntry.treePosition, options.matchedParams)) })";

const BRANCH_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*(?<![A-Za-z0-9_$])LoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_BRANCH_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(LoadingComponent, { params: options.makeThenableParams(slotParams) })";

const OWNER_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*OwnerLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_OWNER_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(OwnerLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, ownerLoadingEntry.treePosition, options.matchedParams)) })";

const PREFETCH_LOADING_CALL_RE =
    /routeChildren\s*=\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*prefetchLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_PREFETCH_LOADING_CALL =
    "routeChildren = /* @__PURE__ */ jsx(prefetchLoadingComponent, { params: options.makeThenableParams(options.matchedParams) })";

const ROUTE_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*routeLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_ROUTE_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(routeLoadingComponent, { params: options.makeThenableParams(options.matchedParams) })";

const SEGMENT_LOADING_FALLBACK_RE =
    /fallback:\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*segmentLoadingComponent\s*,\s*\{\s*\}\s*\)/;
const FIXED_SEGMENT_LOADING_FALLBACK =
    "fallback: /* @__PURE__ */ jsx(segmentLoadingComponent, { params: options.makeThenableParams(resolveAppPageSegmentParams(options.route.routeSegments, treePosition, options.matchedParams)) })";

const PREFETCH_SLOT_LOADING_CALL_RE =
    /slotElement\s*=\s*\/\*\s*@__PURE__\s*\*\/\s*jsx\s*\(\s*getDefaultExport\s*\(\s*prefetchSlotLoadingEntry\.loadingModule\s*\)\s*,\s*\{\s*\}\s*\)/;
const FIXED_PREFETCH_SLOT_LOADING_CALL =
    "slotElement = /* @__PURE__ */ jsx(getDefaultExport(prefetchSlotLoadingEntry.loadingModule), { params: options.makeThenableParams(slotParams) })";

/**
 * Checks if the route wiring method is already fixed (either patched or fixed upstream).
 * If already fixed, the plugin will make no modifications.
 */
// Detects the buggy pattern where pageRenderDependency.resultDependencies is set to pageDependencies
// (which includes layout deps that may suspend and never resolve, blocking the page element).
const PAGE_RESULT_DEPS_RE = /pageRenderDependency\?\.setResultDependencies\(\s*pageDependencies\s*\);/;

// Detects the buggy fallback where pageElement is wrapped in renderAfterAppDependencies(pageElement, pageDependencies)
// when there is no pageRenderDependency, causing the page to block on layout/template deps.
const PAGE_ELEMENT_BLOCKING_DEP_RE =
    /elements\[pageElementId\]\s*=\s*isPrefetchLoadingShell\s*\?\s*null\s*:\s*pageRenderDependency\s*\?\s*pageElement\s*:\s*renderAfterAppDependencies\s*\(\s*pageElement\s*,\s*pageDependencies\s*\);/;

const REQUIRED_SYMBOLS = {
    routeWiring: [
        "makeThenableParams",
        "resolveAppPageSegmentParams",
        "routeLoadingComponent",
        "ancestorLoadingEntry",
        "slotParams",
        "ownerLoadingEntry",
    ],
    routeMatching: ["trieMatch", "getOrBuildTrie", "normalizePathnameForRouteMatch"],
    optimisticRouting: ["getRouteTrie", "matchNode", "decodeMatchedParams", "hrefToRouteParts"],
    prefetchLearning: [
        "resolveOptimisticNavigationPayload",
        "__basePath",
        "optimisticRouteTemplates",
        "optimisticRouteTemplateSources",
        "optimisticRouteTemplateLearning",
        "getOptimisticPrefetchSourceKey",
        "parsePrefetchCacheKey",
        "getPrefetchCache",
        "isSettledPrefetchCacheEntry",
        "learnOptimisticRouteTemplateFromPrefetch",
        "currentHref",
        "rscUrl",
    ],
    suspenseProbe: ["REACT_CLIENT_REFERENCE_TYPE"],
} as const;

export type VinextPatchName = keyof typeof REQUIRED_SYMBOLS;

/**
 * Every replacement below splices in references to vinext-internal helpers
 * (`makeThenableParams`, `trieMatch`, `getPrefetchCache`, ...). If a future
 * vinext release renames or drops one of them, a replacement whose own regex
 * still happens to match would inject a call to an identifier that no longer
 * exists, turning a working runtime into a `ReferenceError`. So a patch is
 * applied only while every helper it depends on is still present: an unpatched
 * vinext is always safe, a half-patched one is not.
 */
export function hasRequiredSymbols(code: string, patchName: VinextPatchName): boolean {
    return REQUIRED_SYMBOLS[patchName].every((symbol) => code.includes(symbol));
}

export function missingRequiredSymbols(code: string, patchName: VinextPatchName): string[] {
    return REQUIRED_SYMBOLS[patchName].filter((symbol) => !code.includes(symbol));
}

function warnIncompatible(filePath: string, patchName: VinextPatchName, code: string): void {
    console.warn(
        `[cfni:vinext-route-wiring-fix] ${filePath} no longer exposes ${missingRequiredSymbols(code, patchName).join(", ")} — this vinext version may have changed; the ${patchName} fix was NOT applied.`,
    );
}

export interface AppPageRouteWiringPatchOptions {
    /**
     * Also strip vinext's render-dependency ordering from layouts, templates,
     * slots, the route element and the page element.
     *
     * On by default: those dependencies make the page element wait on layout and
     * template Suspense deps, so one slow layout child holds the whole page back.
     */
    unblockRenderDependencies?: boolean;

    /**
     * Also drop `pageDependencies` from the PAGE element itself
     * (`setResultDependencies` and the `renderAfterAppDependencies` fallback).
     *
     * Off by default: separate from `unblockRenderDependencies`, because the
     * configuration measured to keep page switching instant keeps vinext's own
     * page-element wiring.
     */
    unblockPageElementDependencies?: boolean;
}

export function isAppPageRouteWiringAlreadyFixed(code: string, options: AppPageRouteWiringPatchOptions = {}): boolean {
    const hasBuggyPrefetch =
        code.includes("firstNestedEntry") &&
        PREFETCH_LOADING_FN_RE.test(code);
    const hasBuggySuspense = !code.includes("!routeLoadingComponent") && ROUTE_LOADING_GUARD_RE.test(code);
    const hasEmptyLoadingProps =
        PAGE_LOADING_FALLBACK_RE.test(code) ||
        ANCESTOR_LOADING_FALLBACK_RE.test(code) ||
        BRANCH_LOADING_FALLBACK_RE.test(code) ||
        OWNER_LOADING_FALLBACK_RE.test(code) ||
        PREFETCH_LOADING_CALL_RE.test(code) ||
        ROUTE_LOADING_FALLBACK_RE.test(code) ||
        SEGMENT_LOADING_FALLBACK_RE.test(code) ||
        PREFETCH_SLOT_LOADING_CALL_RE.test(code);
    const hasBlockingLayoutDependencies =
        options.unblockRenderDependencies === true &&
        code.includes("elements[layoutEntry.id] = renderAfterAppDependencies(layoutElement, [...pageRenderDependency");
    // Second fix: page element should NOT be blocked by pageDependencies (layout Suspense deps)
    const hasBlockingPageDeps =
        options.unblockPageElementDependencies === true &&
        (PAGE_RESULT_DEPS_RE.test(code) || PAGE_ELEMENT_BLOCKING_DEP_RE.test(code));
    return !hasBuggyPrefetch && !hasBuggySuspense && !hasEmptyLoadingProps && !hasBlockingLayoutDependencies && !hasBlockingPageDeps;
}

/**
 * Patches Vinext's app-page-route-wiring to:
 * 1. Pick the leaf route loading or deepest nested loading for prefetch loading shells
 *    instead of the shallowest/root loading module.
 * 2. Guard nested layout Suspense wrappers so routes with their own loading boundary
 *    aren't incorrectly wrapped by ancestor fallback loading shells during full navigation.
 * 3. Pass `{ params }` to loading components instead of `{}` so locale-scoped
 *    loading boundaries (which expect `{ params }`) can resolve translations safely.
 *
 * If the method is already fixed or does not exhibit the buggy pattern, it leaves the code untouched.
 */
export function patchAppPageRouteWiring(code: string, options: AppPageRouteWiringPatchOptions = {}): string {
    if (isAppPageRouteWiringAlreadyFixed(code, options)) {
        return code;
    }

    let result = code;

    const hasBuggyPrefetch =
        code.includes("firstNestedEntry") &&
        !result.includes("deepestNestedEntry") &&
        PREFETCH_LOADING_FN_RE.test(result);
    if (hasBuggyPrefetch) {
        result = result.replace(PREFETCH_LOADING_FN_RE, FIXED_PREFETCH_LOADING_FN);
    }

    const hasBuggySuspense = !result.includes("!routeLoadingComponent") && ROUTE_LOADING_GUARD_RE.test(result);
    if (hasBuggySuspense) {
        result = result.replace(ROUTE_LOADING_GUARD_RE, FIXED_ROUTE_LOADING_GUARD);
    }

    if (PAGE_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(PAGE_LOADING_FALLBACK_RE, FIXED_PAGE_LOADING_FALLBACK);
    }
    while (ANCESTOR_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(ANCESTOR_LOADING_FALLBACK_RE, FIXED_ANCESTOR_LOADING_FALLBACK);
    }
    if (BRANCH_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(BRANCH_LOADING_FALLBACK_RE, FIXED_BRANCH_LOADING_FALLBACK);
    }
    if (OWNER_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(OWNER_LOADING_FALLBACK_RE, FIXED_OWNER_LOADING_FALLBACK);
    }
    if (PREFETCH_LOADING_CALL_RE.test(result)) {
        result = result.replace(PREFETCH_LOADING_CALL_RE, FIXED_PREFETCH_LOADING_CALL);
    }
    if (ROUTE_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(ROUTE_LOADING_FALLBACK_RE, FIXED_ROUTE_LOADING_FALLBACK);
    }
    if (SEGMENT_LOADING_FALLBACK_RE.test(result)) {
        result = result.replace(SEGMENT_LOADING_FALLBACK_RE, FIXED_SEGMENT_LOADING_FALLBACK);
    }
    if (PREFETCH_SLOT_LOADING_CALL_RE.test(result)) {
        result = result.replace(PREFETCH_SLOT_LOADING_CALL_RE, FIXED_PREFETCH_SLOT_LOADING_CALL);
    }

    if (options.unblockRenderDependencies === true) {
        const LAYOUT_DEP_RE =
            /elements\[layoutEntry\.id\]\s*=\s*renderAfterAppDependencies\s*\(\s*layoutElement\s*,\s*\[\s*\.\.\.pageRenderDependency\s*\?\s*\[pageRenderDependency\]\s*:\s*\[\]\s*,\s*\.\.\.layoutDependenciesBefore\[index\]\s*\?\?\s*\[\]\s*\]\s*\);/;
        if (LAYOUT_DEP_RE.test(result)) {
            result = result.replace(
                LAYOUT_DEP_RE,
                "elements[layoutEntry.id] = renderAfterAppDependencies(layoutElement, layoutDependenciesBefore[index] ?? []);"
            );
        }

        const TEMPLATE_DEP_RE =
            /elements\[templateEntry\.id\]\s*=\s*renderAfterAppDependencies\s*\(\s*templateElement\s*,\s*\[\s*\.\.\.pageRenderDependency\s*\?\s*\[pageRenderDependency\]\s*:\s*\[\]\s*,\s*\.\.\.templateDependenciesBeforeById\.get\(templateEntry\.id\)\s*\?\?\s*\[\]\s*\]\s*\);/;
        if (TEMPLATE_DEP_RE.test(result)) {
            result = result.replace(
                TEMPLATE_DEP_RE,
                "elements[templateEntry.id] = renderAfterAppDependencies(templateElement, templateDependenciesBeforeById.get(templateEntry.id) ?? []);"
            );
        }

        const SLOT_DEP_RE =
            /elements\[slotId\]\s*=\s*renderAfterAppDependencies\s*\(\s*slotElement\s*,\s*\[\s*\.\.\.pageRenderDependency\s*\?\s*\[pageRenderDependency\]\s*:\s*\[\]\s*,\s*\.\.\.targetIndex\s*>=\s*0\s*\?\s*slotDependenciesByLayoutIndex\[targetIndex\]\s*\?\?\s*\[\]\s*:\s*\[\]\s*\]\s*\);/;
        if (SLOT_DEP_RE.test(result)) {
            result = result.replace(
                SLOT_DEP_RE,
                "elements[slotId] = renderAfterAppDependencies(slotElement, targetIndex >= 0 ? slotDependenciesByLayoutIndex[targetIndex] ?? [] : []);"
            );
        }

        const ROUTE_DEP_RE =
            /elements\[routeId\]\s*=\s*pageRenderDependency\s*\?\s*renderAfterAppDependencies\s*\(\s*routeElement\s*,\s*\[pageRenderDependency\]\s*\)\s*:\s*routeElement;/;
        if (ROUTE_DEP_RE.test(result)) {
            result = result.replace(
                ROUTE_DEP_RE,
                "elements[routeId] = routeElement;"
            );
        }

        // Second fix: prevent pageElement from being blocked by layout/template Suspense dependencies.
        // When pageRenderDependency.resultDependencies = pageDependencies, if any layout child suspends
        // (e.g. NotificationBell), its layoutDependency never resolves, freezing the entire page.
        // Fix 1: empty out resultDependencies so page is not gated on layout deps resolving.
        if (options.unblockPageElementDependencies === true && PAGE_RESULT_DEPS_RE.test(result)) {
            result = result.replace(
                PAGE_RESULT_DEPS_RE,
                "pageRenderDependency?.setResultDependencies([]);"
            );
        }
        // Fix 2: remove the renderAfterAppDependencies fallback on pageElement (no-pageRenderDependency path).
        // Previously: isPrefetchLoadingShell ? null : pageRenderDependency ? pageElement : renderAfterAppDependencies(pageElement, pageDependencies)
        // After: isPrefetchLoadingShell ? null : pageElement  (let React Suspense handle it naturally)
        if (options.unblockPageElementDependencies === true && PAGE_ELEMENT_BLOCKING_DEP_RE.test(result)) {
            result = result.replace(
                PAGE_ELEMENT_BLOCKING_DEP_RE,
                "elements[pageElementId] = isPrefetchLoadingShell ? null : pageElement;"
            );
        }
    }

    return result;
}

export function isRouteMatchingFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/routing/route-matching.js") || cleanId.endsWith("/routing/route-matching.ts");
}

export function isRouteMatchingAlreadyFixed(code: string): boolean {
    if (code.includes("hasLeadingLocaleParam")) {
        return true;
    }
    const hasUpstreamLocaleMatch =
        code.includes(":locale") &&
        (code.includes("activeLocale") || code.includes("getActiveRouteLocale") || code.includes("matchWithLocale") || code.includes("localeMatch")) &&
        /function\s+matchRouteWithTrie[\s\S]*?:locale/.test(code);
    return Boolean(hasUpstreamLocaleMatch);
}

const GET_ACTIVE_ROUTE_LOCALE_FN = `function getActiveRouteLocale() {
	return (typeof document !== "undefined" && (document.documentElement?.lang || document.cookie.match(/__user_locale_key__=([^;]+)/)?.[1])) || (typeof window !== "undefined" && window.__VINEXT_LOCALE__) || "en";
}
`;

const MATCH_ROUTE_WITH_TRIE_RE =
    /function\s+matchRouteWithTrie\s*\(\s*url\s*,\s*routes\s*,\s*cache\s*\)\s*\{[\s\S]*?normalizePathnameForRouteMatch[\s\S]*?getOrBuildTrie\(\s*cache\s*,\s*routes\s*\)\s*;?\s*\n\s*return\s+trieMatch\(\s*trie\s*,\s*urlParts\s*\)\s*;?\s*\}/;

const FIXED_MATCH_ROUTE_WITH_TRIE_BODY = `function matchRouteWithTrie(url, routes, cache) {
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
    /function\s+matchRouteWithTrieRawPathname\s*\(\s*url\s*,\s*routes\s*,\s*cache\s*\)\s*\{[\s\S]*?urlParts\s*=[\s\S]*?return\s+trieMatch\(\s*(?:trie|getOrBuildTrie\(\s*cache\s*,\s*routes\s*\))\s*,\s*urlParts\s*\)\s*;?\s*\}/;

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
    // Each function is gated on its OWN unpatched regex still matching, not on a
    // whole-file "hasLeadingLocaleParam" marker — patching the first function
    // would otherwise make that marker true and silently skip the second.
    if (MATCH_ROUTE_WITH_TRIE_RE.test(result)) {
        const replacement = result.includes("function getActiveRouteLocale")
            ? FIXED_MATCH_ROUTE_WITH_TRIE_BODY
            : `${GET_ACTIVE_ROUTE_LOCALE_FN}${FIXED_MATCH_ROUTE_WITH_TRIE_BODY}`;
        result = result.replace(MATCH_ROUTE_WITH_TRIE_RE, replacement);
    }
    if (MATCH_ROUTE_WITH_TRIE_RAW_RE.test(result)) {
        const replacement = result.includes("function getActiveRouteLocale")
            ? FIXED_MATCH_ROUTE_WITH_TRIE_RAW
            : `${GET_ACTIVE_ROUTE_LOCALE_FN}${FIXED_MATCH_ROUTE_WITH_TRIE_RAW}`;
        result = result.replace(MATCH_ROUTE_WITH_TRIE_RAW_RE, replacement);
    }
    return result;
}

export function isOptimisticRoutingFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-optimistic-routing.js") || cleanId.endsWith("/app-optimistic-routing.ts");
}

export function isOptimisticRoutingAlreadyFixed(code: string): boolean {
    const hasLocalePrefixFirst =
        code.includes("hasLeadingLocaleParam") &&
        code.indexOf("hasLeadingLocaleParam") < code.indexOf("const match = matchNode(trie, urlParts.normalized");
    const hasRawPartsFix = code.includes("options.rawUrlParts[0] !== options.match.params.locale");
    if (hasLocalePrefixFirst && hasRawPartsFix) {
        return true;
    }
    const hasUpstreamLocaleMatch =
        code.includes(":locale") &&
        (code.includes("activeLocale") || code.includes("getActiveRouteLocale") || code.includes("localeMatch")) &&
        /function\s+matchOptimisticRouteManifestRoute[\s\S]*?:locale/.test(code);
    const hasUpstreamRawPartsFix =
        /function\s+resolveOptimisticNavigationParams[\s\S]*?:locale/.test(code);
    return Boolean(hasUpstreamLocaleMatch && hasUpstreamRawPartsFix);
}

const MATCH_OPTIMISTIC_ROUTE_RE =
    /function\s+matchOptimisticRouteManifestRoute\s*\(\s*options\s*\)\s*\{[\s\S]*?hrefToRouteParts\(\s*options\.href\s*,\s*options\.basePath\s*\)[\s\S]*?matchNode\([\s\S]*?urlParts\.normalized\s*,\s*0\s*,\s*\[\]\)[\s\S]*?decodeMatchedParams\(\s*match\.params\s*\)[\s\S]*?\n\}/;

const FIXED_MATCH_OPTIMISTIC_ROUTE_BODY = `function matchOptimisticRouteManifestRoute(options) {
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
    if (!result.includes("hasLeadingLocaleParam") && MATCH_OPTIMISTIC_ROUTE_RE.test(result)) {
        const replacement = result.includes("function getActiveRouteLocale")
            ? FIXED_MATCH_OPTIMISTIC_ROUTE_BODY
            : `${GET_ACTIVE_ROUTE_LOCALE_FN}${FIXED_MATCH_OPTIMISTIC_ROUTE_BODY}`;
        result = result.replace(MATCH_OPTIMISTIC_ROUTE_RE, replacement);
    }
    if (!result.includes("options.rawUrlParts[0] !== options.match.params.locale") && RESOLVE_OPTIMISTIC_NAV_PARAMS_RE.test(result)) {
        result = result.replace(RESOLVE_OPTIMISTIC_NAV_PARAMS_RE, FIXED_RESOLVE_OPTIMISTIC_NAV_PARAMS);
    }
    return result;
}

export function isPrefetchLearningFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-browser-entry.js") || cleanId.endsWith("/app-browser-entry.ts");
}

export function isPrefetchLearningAlreadyFixed(code: string): boolean {
    const hasFixedFunction = code.includes("stripRsc(parsePrefetchCacheKey(cacheKey).rscUrl)") && code.includes("hasOptimisticTemplate");
    const hasFixedCallSite = code.includes("targetHref: currentHref,") && code.includes("targetRscUrl: rscUrl,") && !LEARN_TEMPLATES_CALL_RE.test(code);
    if (hasFixedFunction && hasFixedCallSite) {
        return true;
    }
    // Upstream fixed / refactored: if the function exists but does not have the buggy unsettled skip
    const hasBuggySkip = /if\s*\(\s*!isSettledPrefetchCacheEntry\(\s*entry\s*\)\s*\)\s*continue\s*;/.test(code);
    if (!hasBuggySkip && code.includes("learnOptimisticRouteTemplatesFromPrefetchCache")) {
        return true;
    }
    return false;
}

const LEARN_TEMPLATES_FN_RE =
    /async\s+function\s+learnOptimisticRouteTemplatesFromPrefetchCache\s*\(\s*options\s*\)\s*\{[\s\S]*?getPrefetchCache\(\)[\s\S]*?if\s*\(\s*!isSettledPrefetchCacheEntry\(\s*entry\s*\)\s*\)\s*continue\s*;[\s\S]*?learnOptimisticRouteTemplateFromPrefetch[\s\S]*?await\s+Promise\.allSettled\(\s*learning\s*\)\s*;?\s*\}/;

const FIXED_LEARN_TEMPLATES_FN = `async function learnOptimisticRouteTemplatesFromPrefetchCache(options) {
	if (options.routeManifest === null) return;
	const hasOptimisticTemplate = options.targetHref !== void 0 && resolveOptimisticNavigationPayload({
		basePath: __basePath,
		href: options.targetHref,
		interceptionContext: options.interceptionContext,
		mountedSlotsHeader: options.mountedSlotsHeader,
		routeManifest: options.routeManifest,
		templates: optimisticRouteTemplates
	}) !== null;
	const stripRsc = (u) => {
		if (!u) return "";
		const q = u.indexOf("?");
		if (q === -1) return u;
		const sp = new URLSearchParams(u.slice(q + 1));
		sp.delete("_rsc");
		sp.delete("%5Frsc");
		const s = sp.toString();
		return s ? \`\${u.slice(0, q)}?\${s}\` : u.slice(0, q);
	};
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
		const isPendingNavigationTarget = !hasOptimisticTemplate && !isSettledPrefetchCacheEntry(entry) && entry.pending !== void 0 && options.targetRscUrl !== void 0 && stripRsc(parsePrefetchCacheKey(cacheKey).rscUrl) === stripRsc(options.targetRscUrl);
		if (!isSettledPrefetchCacheEntry(entry) && !isPendingNavigationTarget) continue;
		const promise = (async () => {
			let settledEntry = entry;
			if (!isSettledPrefetchCacheEntry(settledEntry)) {
				await Promise.race([
					settledEntry.pending?.catch(() => {}),
					new Promise((resolve) => setTimeout(resolve, 3000))
				]);
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
    /await\s+learnOptimisticRouteTemplatesFromPrefetchCache\(\s*\{\s*interceptionContext:\s*requestInterceptionContext,\s*(targetRscUrl:\s*rscUrl,\s*)?mountedSlotsHeader,[\s\S]*?routeManifest\s*\n\s*\}\);/;

const FIXED_LEARN_TEMPLATES_CALL = `await learnOptimisticRouteTemplatesFromPrefetchCache({
							interceptionContext: requestInterceptionContext,
							targetHref: currentHref,
							targetRscUrl: rscUrl,
							mountedSlotsHeader,
							routeManifest
						});`;

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
 * The wait is bounded by a 3s timeout so a stale/stalled prefetch left over
 * from an earlier, unrelated navigation can never block a later one — once the
 * timeout wins the race, the entry is treated as still-unsettled and this
 * learning attempt simply gives up on it, same as if it were never awaited.
 */
export function patchPrefetchLearning(code: string): string {
    if (isPrefetchLearningAlreadyFixed(code)) {
        return code;
    }

    let result = code;
    const hasBuggyFn =
        !result.includes("hasOptimisticTemplate") &&
        !result.includes("isPendingNavigationTarget") &&
        LEARN_TEMPLATES_FN_RE.test(result);
    const hasFixedFunction =
        result.includes("stripRsc(parsePrefetchCacheKey(cacheKey).rscUrl)") &&
        result.includes("hasOptimisticTemplate");

    if (hasBuggyFn) {
        result = result.replace(LEARN_TEMPLATES_FN_RE, FIXED_LEARN_TEMPLATES_FN);
    }
    if ((hasBuggyFn || hasFixedFunction) && LEARN_TEMPLATES_CALL_RE.test(result)) {
        result = result.replace(LEARN_TEMPLATES_CALL_RE, FIXED_LEARN_TEMPLATES_CALL);
    }
    return result;
}

export function resolveVinextBrowserEntryPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-browser-entry.js");
    return existsSync(directPath) ? directPath : null;
}

export function isAppPageProbeFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-page-probe.js") || cleanId.endsWith("/app-page-probe.ts");
}

export function isAppPageProbeAlreadyFixed(code: string): boolean {
    return code.includes("react.suspense") && code.includes("REACT_SUSPENSE_TYPE");
}

const REACT_SUSPENSE_DECL_RE = /const\s+REACT_CLIENT_REFERENCE_TYPE\s*=\s*Symbol\.for\(["']react\.client\.reference["']\);/;
const PROBE_VISIT_FRAGMENT_RE = /if\s*\(\s*value\.type\s*===\s*Fragment\s*\|\|\s*typeof\s+value\.type\s*===\s*["']string["']\s*\)\s*\{/;

export function patchAppPageProbe(code: string): string {
    if (isAppPageProbeAlreadyFixed(code)) {
        return code;
    }

    let result = code;
    if (!result.includes("REACT_SUSPENSE_TYPE") && REACT_SUSPENSE_DECL_RE.test(result)) {
        result = result.replace(
            REACT_SUSPENSE_DECL_RE,
            'const REACT_CLIENT_REFERENCE_TYPE = Symbol.for("react.client.reference");\nconst REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");'
        );
    }

    // Only reference REACT_SUSPENSE_TYPE if the declaration patch above actually
    // landed (either just now, or already present from an earlier run) — otherwise
    // this splices in a ReferenceError instead of a fix.
    if (result.includes("REACT_SUSPENSE_TYPE") && PROBE_VISIT_FRAGMENT_RE.test(result)) {
        result = result.replace(
            PROBE_VISIT_FRAGMENT_RE,
            `if (value.type === Symbol.for("react.suspense") || value.type === REACT_SUSPENSE_TYPE) {\n\t\t\tif (value.props && "fallback" in value.props) await visit(value.props.fallback, depth + 1);\n\t\t\treturn;\n\t\t}\n\t\tif (value.type === Fragment || typeof value.type === "string") {`
        );
    }

    return result;
}

export function resolveVinextAppPageProbePath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-page-probe.js");
    return existsSync(directPath) ? directPath : null;
}

export function isVinextAppPageProbeSafeOnDisk(root: string = process.cwd()): boolean {
    const filePath = resolveVinextAppPageProbePath(root);
    if (!filePath) return false;
    try {
        const content = readFileSync(filePath, "utf8");
        return isAppPageProbeAlreadyFixed(content);
    } catch {
        return false;
    }
}

const SUSPENSION_GUARDED_RELEASE_RE = /if\s*\(\s*!isAppRenderSuspension\(\s*error\s*\)\s*\)\s*dependency\.release\(\);/;

export function isRenderDependencyFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-render-dependency.js") || cleanId.endsWith("/app-render-dependency.tsx") || cleanId.endsWith("/app-render-dependency.ts");
}

/**
 * A component that suspends (a `<Suspense>` boundary doing its job) throws a
 * thenable out of the dependency barrier. Upstream vinext treats that as "not
 * finished" and skips `dependency.release()`, so every element registered as
 * depending on that component — including the page element under a layout —
 * stays blocked on a promise that only settles once the suspending component
 * fully resolves. The whole page then waits on the slowest suspended child,
 * which is exactly what `<Suspense>` exists to prevent.
 *
 * The barrier only ever gates *render ordering*, so releasing on suspension is
 * safe: React still renders the fallback and streams the real subtree in later.
 */
export function isRenderDependencyAlreadyFixed(code: string): boolean {
    if (!code.includes("renderAppComponentWithDependencyBarrier")) return true;
    return !SUSPENSION_GUARDED_RELEASE_RE.test(code);
}

export function patchRenderDependency(code: string): string {
    if (!SUSPENSION_GUARDED_RELEASE_RE.test(code)) return code;
    return code.replace(SUSPENSION_GUARDED_RELEASE_RE, "dependency.release();");
}

export function resolveVinextRenderDependencyPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-render-dependency.js");
    return existsSync(directPath) ? directPath : null;
}

export function isVinextRenderDependencySafeOnDisk(root: string = process.cwd()): boolean {
    const filePath = resolveVinextRenderDependencyPath(root);
    if (!filePath) return false;
    try {
        return isRenderDependencyAlreadyFixed(readFileSync(filePath, "utf8"));
    } catch {
        return false;
    }
}

/**
 * Measured against a real app: 200ms is the value that keeps page-to-page
 * switching instant. Raising it back toward vinext's own 3000ms makes the
 * awaited learning pass block the live navigation instead, so the next page
 * does not paint until the full response lands.
 */
const OPTIMISTIC_LEARNING_TIMEOUT_MS = 200;

const OPTIMISTIC_LEARNING_BLOCKING_TIMEOUT_RE = /(new Promise\(\(resolve\)\s*=>\s*setTimeout\(resolve,\s*)3000(\)\))/;

export function isOptimisticLearningTimeoutFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-browser-entry.js") || cleanId.endsWith("/app-browser-entry.ts") || cleanId.endsWith("/app-browser-entry.tsx");
}

/**
 * `learnOptimisticRouteTemplatesFromPrefetchCache` is awaited on the live
 * navigation path (to decide whether an optimistic route shell can be shown),
 * but its own purpose is a background optimization for FUTURE navigations —
 * it races each unsettled prefetch cache entry against a fixed safety-cap
 * timeout before giving up on learning from it. A 3000ms cap on that race
 * means one stuck/slow prefetch entry (e.g. one still stuck behind a slow
 * shared-layout render) can hold up the CURRENT navigation for seconds,
 * exactly defeating the fast/instant feedback this mechanism exists to
 * provide. Shortening the cap doesn't change correctness — learning that
 * misses this window simply falls through to the normal live-fetch path,
 * which is what happens on any cache-miss already.
 *
 * It DOES change perceived speed though: cut too far and the in-flight prefetch
 * of the navigation target loses the race, so no optimistic shell is committed
 * and the target route's `loading.tsx` never paints. Off by default for that
 * reason — opt in, and pass a number to choose the cap in ms.
 */
export function isOptimisticLearningTimeoutAlreadyFixed(code: string): boolean {
    return !OPTIMISTIC_LEARNING_BLOCKING_TIMEOUT_RE.test(code);
}

export function patchOptimisticLearningTimeout(code: string, timeoutMs: number = OPTIMISTIC_LEARNING_TIMEOUT_MS): string {
    if (!OPTIMISTIC_LEARNING_BLOCKING_TIMEOUT_RE.test(code)) return code;
    return code.replace(OPTIMISTIC_LEARNING_BLOCKING_TIMEOUT_RE, `$1${timeoutMs}$2`);
}

export function resolveVinextOptimisticLearningTimeoutPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-browser-entry.js");
    return existsSync(directPath) ? directPath : null;
}

export function isVinextOptimisticLearningTimeoutSafeOnDisk(root: string = process.cwd()): boolean {
    const filePath = resolveVinextOptimisticLearningTimeoutPath(root);
    if (!filePath) return false;
    try {
        return isOptimisticLearningTimeoutAlreadyFixed(readFileSync(filePath, "utf8"));
    } catch {
        return false;
    }
}

const PAGE_INVOKER_GUARDED_RELEASE_RE = /if\s*\(renderDependency\s*&&\s*hasPageLoadingBoundary\)\s*Promise\.resolve\(\)\.then\(\(\)\s*=>\s*renderDependency\.release\(\)\);/;

export function isPageInvokerSuspensionReleaseFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-page-element-builder.js") || cleanId.endsWith("/app-page-element-builder.ts") || cleanId.endsWith("/app-page-element-builder.tsx");
}

/**
 * The page component's own suspension barrier (`PageInvoker`, distinct from
 * the layout/template barrier in `app-render-dependency.js`) only released
 * its render dependency on synchronous suspension when `hasPageLoadingBoundary`
 * was true — i.e. only when the route has its own (or an ancestor) `loading.tsx`.
 * A route without one left `pageRenderDependency` permanently unreleased on
 * suspension, inconsistent with every other barrier in this file, all of
 * which release unconditionally because the barrier only gates render
 * ordering — React's own nearest-ancestor Suspense still shows a fallback
 * and streams the real subtree in regardless of whether this specific
 * dependency object ever resolves.
 */
export function isPageInvokerSuspensionReleaseAlreadyFixed(code: string): boolean {
    return !PAGE_INVOKER_GUARDED_RELEASE_RE.test(code);
}

export function patchPageInvokerSuspensionRelease(code: string): string {
    if (!PAGE_INVOKER_GUARDED_RELEASE_RE.test(code)) return code;
    return code.replace(
        PAGE_INVOKER_GUARDED_RELEASE_RE,
        "if (renderDependency) Promise.resolve().then(() => renderDependency.release());",
    );
}

export function resolveVinextPageInvokerSuspensionReleasePath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-page-element-builder.js");
    return existsSync(directPath) ? directPath : null;
}

export function isVinextPageInvokerSuspensionReleaseSafeOnDisk(root: string = process.cwd()): boolean {
    const filePath = resolveVinextPageInvokerSuspensionReleasePath(root);
    if (!filePath) return false;
    try {
        return isPageInvokerSuspensionReleaseAlreadyFixed(readFileSync(filePath, "utf8"));
    } catch {
        return false;
    }
}

const NAV_CONTROLLER_BEGIN_NAVIGATION_RE =
    /function\s+beginNavigation\(\s*\)\s*\{(\n([\t ]*))latestHmrUpdateId\s*\+=\s*1;/;

const NAV_CONTROLLER_STATE_DECL_RE = /(\n\s*let\s+latestHmrUpdateId\s*=\s*0;)/;

const NAV_CONTROLLER_RETURN_RE = /(\n\s*return\s*\{\s*\n\s*beginNavigation,)/;

const NAV_ENTRY_NAVIGATE_FN_RE =
    /(navigate:\s*async function navigateRsc\([^)]*\)\s*\{)(\n([\t ]*))/;

const NAV_ENTRY_BEGIN_NAVIGATION_RE =
    /(\n[\t ]*const navId = browserNavigationController\.)beginNavigation\(\);/;

const REFRESH_DEFERRAL_WINDOW_MS = 600;

export function isRefreshDeferralNavControllerFile(id: string): boolean {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    return cleanId.endsWith("/app-browser-navigation-controller.js") || cleanId.endsWith("/app-browser-navigation-controller.ts");
}

/**
 * A `refresh()` navigation (a Server Action revalidate, a router refresh) that
 * lands while a normal page-to-page navigation is still in flight cancels that
 * navigation: both go through the same `beginNavigation()` counter, so the
 * refresh takes the active navigation id and the user's in-progress route
 * switch is abandoned mid-flight — the old page stays on screen and the target
 * route's `loading.tsx` never paints.
 *
 * The fix tags each `beginNavigation` call with its kind, records when the last
 * NON-refresh navigation started, and makes a refresh wait (polling every 50ms)
 * while a normal navigation is still inside a short window. Refreshes are
 * background work, so deferring one by at most `REFRESH_DEFERRAL_WINDOW_MS` is
 * invisible; cancelling a user's navigation is not.
 */
export function isRefreshDeferralNavControllerAlreadyFixed(code: string): boolean {
    return code.includes("isRecentNonRefreshNavigationInFlight") || !NAV_CONTROLLER_BEGIN_NAVIGATION_RE.test(code);
}

export function patchRefreshDeferralNavController(code: string): string {
    if (isRefreshDeferralNavControllerAlreadyFixed(code)) return code;
    if (!NAV_CONTROLLER_STATE_DECL_RE.test(code) || !NAV_CONTROLLER_RETURN_RE.test(code)) return code;

    let result = code.replace(
        NAV_CONTROLLER_STATE_DECL_RE,
        "\n\tlet lastNonRefreshNavigationStartedAt = 0;$1",
    );
    result = result.replace(
        NAV_CONTROLLER_BEGIN_NAVIGATION_RE,
        (_m, _nl: string, indent: string) =>
            `function beginNavigation(kind) {\n${indent}latestHmrUpdateId += 1;\n${indent}if (kind !== "refresh") lastNonRefreshNavigationStartedAt = Date.now();`,
    );
    result = result.replace(
        /(\n\s*function getActiveNavigationId\(\) \{)/,
        `\n\tconst REFRESH_DEFERRAL_WINDOW_MS = ${REFRESH_DEFERRAL_WINDOW_MS};\n\tfunction isRecentNonRefreshNavigationInFlight() {\n\t\treturn lastNonRefreshNavigationStartedAt !== 0 && Date.now() - lastNonRefreshNavigationStartedAt < REFRESH_DEFERRAL_WINDOW_MS;\n\t}$1`,
    );
    result = result.replace(NAV_CONTROLLER_RETURN_RE, "$1\n\t\tisRecentNonRefreshNavigationInFlight,");
    return result;
}

export function isRefreshDeferralEntryAlreadyFixed(code: string): boolean {
    return code.includes("isRecentNonRefreshNavigationInFlight()") || !NAV_ENTRY_NAVIGATE_FN_RE.test(code);
}

/**
 * The wait must run at the very top of `navigateRsc`, before the abort
 * coordinators run — waiting after them would mean a deferred refresh already
 * cancelled the in-flight navigation it exists to protect.
 */
export function patchRefreshDeferralEntry(code: string): string {
    if (isRefreshDeferralEntryAlreadyFixed(code)) return code;
    let result = code.replace(
        NAV_ENTRY_NAVIGATE_FN_RE,
        (_m, signature: string, _nl: string, indent: string) =>
            `${signature}\n${indent}if (navigationKind === "refresh") {\n${indent}\twhile (browserNavigationController.isRecentNonRefreshNavigationInFlight()) await new Promise((resolve) => setTimeout(resolve, 50));\n${indent}}\n${indent}`,
    );
    result = result.replace(NAV_ENTRY_BEGIN_NAVIGATION_RE, "$1beginNavigation(navigationKind);");
    return result;
}

export function resolveVinextNavControllerPath(root: string = process.cwd()): string | null {
    const directPath = resolve(root, "node_modules/vinext/dist/server/app-browser-navigation-controller.js");
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

/**
 * Checks if the on-disk `app-page-route-wiring.js` file inside `node_modules/vinext/dist/server`
 * exists, is readable, and has all route-wiring and loading-fallback fixes applied.
 * Returns `false` if the file does not exist, cannot be read, or contains unpatched/buggy patterns.
 */
export function isVinextAppPageRouteWiringSafeOnDisk(root: string = process.cwd()): boolean {
    const filePath = resolveVinextAppPageRouteWiringPath(root);
    if (!filePath) return false;
    try {
        const content = readFileSync(filePath, "utf8");
        return isAppPageRouteWiringAlreadyFixed(content);
    } catch {
        return false;
    }
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
    unblockRenderDependencies?: boolean;
    unblockPageElementDependencies?: boolean;
    refreshDeferral?: boolean;
    routeMatching?: boolean;
    optimisticRouting?: boolean;
    prefetchLearning?: boolean;
    suspenseProbe?: boolean;
    renderDependency?: boolean;
    optimisticLearningTimeout?: boolean | number;
    pageInvokerSuspensionRelease?: boolean;
}

export function syncPatchVinextOnDisk(root: string = process.cwd(), options: SyncPatchVinextOnDiskOptions = {}): boolean {
    const { routeWiring = true, routeMatching = true, optimisticRouting = true, prefetchLearning = true, suspenseProbe = true, renderDependency = true, optimisticLearningTimeout = true, pageInvokerSuspensionRelease = true, unblockRenderDependencies = true, unblockPageElementDependencies = false, refreshDeferral = true } = options;
    const optimisticLearningTimeoutMs = typeof optimisticLearningTimeout === "number" ? optimisticLearningTimeout : undefined;
    let changed = false;

    const wiringPath = routeWiring ? resolveVinextAppPageRouteWiringPath(root) : null;
    if (wiringPath) {
        try {
            const content = readFileSync(wiringPath, "utf8");
            if (!isAppPageRouteWiringAlreadyFixed(content, { unblockRenderDependencies, unblockPageElementDependencies }) && !hasRequiredSymbols(content, "routeWiring")) {
                warnIncompatible(wiringPath, "routeWiring", content);
            } else if (!isAppPageRouteWiringAlreadyFixed(content, { unblockRenderDependencies, unblockPageElementDependencies })) {
                const patched = patchAppPageRouteWiring(content, { unblockRenderDependencies, unblockPageElementDependencies });
                if (patched !== content) {
                    writeFileSync(wiringPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${wiringPath} does not match the expected shape for patchAppPageRouteWiring — this vinext version may have changed; the route-wiring fix was NOT applied.`);
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
            if (!isRouteMatchingAlreadyFixed(content) && !hasRequiredSymbols(content, "routeMatching")) {
                warnIncompatible(matchingPath, "routeMatching", content);
            } else if (!isRouteMatchingAlreadyFixed(content)) {
                const patched = patchRouteMatching(content);
                if (patched !== content) {
                    writeFileSync(matchingPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${matchingPath} does not match the expected shape for patchRouteMatching — this vinext version may have changed; the route-matching fix was NOT applied.`);
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
            if (!isOptimisticRoutingAlreadyFixed(content) && !hasRequiredSymbols(content, "optimisticRouting")) {
                warnIncompatible(optimisticPath, "optimisticRouting", content);
            } else if (!isOptimisticRoutingAlreadyFixed(content)) {
                const patched = patchOptimisticRouting(content);
                if (patched !== content) {
                    writeFileSync(optimisticPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${optimisticPath} does not match the expected shape for patchOptimisticRouting — this vinext version may have changed; the optimistic-routing fix was NOT applied.`);
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
            if (!isPrefetchLearningAlreadyFixed(content) && !hasRequiredSymbols(content, "prefetchLearning")) {
                warnIncompatible(browserEntryPath, "prefetchLearning", content);
            } else if (!isPrefetchLearningAlreadyFixed(content)) {
                const patched = patchPrefetchLearning(content);
                if (patched !== content) {
                    writeFileSync(browserEntryPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${browserEntryPath} does not match the expected shape for patchPrefetchLearning — this vinext version may have changed; the prefetch-learning fix was NOT applied.`);
                }
            }
        } catch {
            // Failed read/write
        }
    }

    const probePath = suspenseProbe ? resolveVinextAppPageProbePath(root) : null;
    if (probePath) {
        try {
            const content = readFileSync(probePath, "utf8");
            if (!isAppPageProbeAlreadyFixed(content) && !hasRequiredSymbols(content, "suspenseProbe")) {
                warnIncompatible(probePath, "suspenseProbe", content);
            } else if (!isAppPageProbeAlreadyFixed(content)) {
                const patched = patchAppPageProbe(content);
                if (patched !== content) {
                    writeFileSync(probePath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${probePath} does not match the expected shape for patchAppPageProbe — this vinext version may have changed; the suspense-probe fix was NOT applied.`);
                }
            }
        } catch {
            // Failed read/write
        }
    }

    const renderDependencyPath = renderDependency ? resolveVinextRenderDependencyPath(root) : null;
    if (renderDependencyPath) {
        try {
            const content = readFileSync(renderDependencyPath, "utf8");
            if (!isRenderDependencyAlreadyFixed(content)) {
                const patched = patchRenderDependency(content);
                if (patched !== content) {
                    writeFileSync(renderDependencyPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${renderDependencyPath} does not match the expected shape for patchRenderDependency — this vinext version may have changed; the render-dependency fix was NOT applied.`);
                }
            }
        } catch {
            // Failed read/write
        }
    }

    // Not a bare truthy check: `optimisticLearningTimeout: 0` is a valid (if odd)
    // explicit cap and must still enable the patch, same as the plugin-level flag.
    const optimisticLearningTimeoutEnabled = optimisticLearningTimeout !== false && optimisticLearningTimeout !== undefined;
    const optimisticLearningTimeoutPath = optimisticLearningTimeoutEnabled ? resolveVinextOptimisticLearningTimeoutPath(root) : null;
    if (optimisticLearningTimeoutPath) {
        try {
            const content = readFileSync(optimisticLearningTimeoutPath, "utf8");
            if (!isOptimisticLearningTimeoutAlreadyFixed(content)) {
                const patched = patchOptimisticLearningTimeout(content, optimisticLearningTimeoutMs);
                if (patched !== content) {
                    writeFileSync(optimisticLearningTimeoutPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${optimisticLearningTimeoutPath} does not match the expected shape for patchOptimisticLearningTimeout — this vinext version may have changed; the optimistic-learning-timeout fix was NOT applied.`);
                }
            }
        } catch {
            // Failed read/write
        }
    }

    const pageInvokerSuspensionReleasePath = pageInvokerSuspensionRelease ? resolveVinextPageInvokerSuspensionReleasePath(root) : null;
    if (pageInvokerSuspensionReleasePath) {
        try {
            const content = readFileSync(pageInvokerSuspensionReleasePath, "utf8");
            if (!isPageInvokerSuspensionReleaseAlreadyFixed(content)) {
                const patched = patchPageInvokerSuspensionRelease(content);
                if (patched !== content) {
                    writeFileSync(pageInvokerSuspensionReleasePath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${pageInvokerSuspensionReleasePath} does not match the expected shape for patchPageInvokerSuspensionRelease — this vinext version may have changed; the page-invoker-suspension-release fix was NOT applied.`);
                }
            }
        } catch {
            // Failed read/write
        }
    }


    const navControllerPath = refreshDeferral ? resolveVinextNavControllerPath(root) : null;
    if (navControllerPath) {
        try {
            const content = readFileSync(navControllerPath, "utf8");
            if (!isRefreshDeferralNavControllerAlreadyFixed(content)) {
                const patched = patchRefreshDeferralNavController(content);
                if (patched !== content) {
                    writeFileSync(navControllerPath, patched, "utf8");
                    changed = true;
                } else {
                    console.warn(`[cfni:vinext-route-wiring-fix] ${navControllerPath} does not match the expected shape for patchRefreshDeferralNavController — this vinext version may have changed; the refresh-deferral fix was NOT applied.`);
                }
            }
            const entryPath = resolveVinextBrowserEntryPath(root);
            if (entryPath && isRefreshDeferralNavControllerAlreadyFixed(readFileSync(navControllerPath, "utf8"))) {
                const entryContent = readFileSync(entryPath, "utf8");
                if (!isRefreshDeferralEntryAlreadyFixed(entryContent)) {
                    const patchedEntry = patchRefreshDeferralEntry(entryContent);
                    if (patchedEntry !== entryContent) {
                        writeFileSync(entryPath, patchedEntry, "utf8");
                        changed = true;
                    }
                }
            }
        } catch {
            // Failed read/write
        }
    }

    return changed;
}

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

/**
 * True when a vinext file we patch is newer than Vite's pre-bundle cache.
 *
 * The optimizer keys its cache off a config/lockfile hash, not the bytes of a
 * file a plugin rewrote out-of-band, so a patch applied on an EARLIER run leaves
 * a cache built from the pre-patch source in place: the disk says "already
 * fixed", nothing changes this run, and the browser/RSC runtime keeps executing
 * the unpatched bundle. Comparing mtimes catches that case, which a
 * `changed`-only bust cannot see.
 */
export function isVinextOptimizeDepsCacheStale(root: string, cacheDir: string): boolean {
    const patchedFiles = [
        resolveVinextAppPageRouteWiringPath(root),
        resolveVinextRouteMatchingPath(root),
        resolveVinextOptimisticRoutingPath(root),
        resolveVinextBrowserEntryPath(root),
        resolveVinextAppPageProbePath(root),
        resolveVinextRenderDependencyPath(root),
        resolveVinextPageInvokerSuspensionReleasePath(root),
    ].filter((filePath): filePath is string => filePath !== null);

    let newestPatch = 0;
    for (const filePath of patchedFiles) {
        try {
            newestPatch = Math.max(newestPatch, statSync(filePath).mtimeMs);
        } catch {
            // Unreadable — ignore, it cannot prove staleness either way
        }
    }
    if (newestPatch === 0) return false;

    for (const sub of ["deps", "deps_ssr", "deps_rsc"]) {
        const dir = resolve(cacheDir, sub);
        if (!existsSync(dir)) continue;
        try {
            if (statSync(dir).mtimeMs < newestPatch) return true;
        } catch {
            // Unreadable — treat as not provably stale
        }
    }
    return false;
}

/**
 * Options for Vinext route wiring fix plugin.
 *
 * ⚠️ **DANGER / EXPERIMENTAL**: This plugin directly monkey-patches vinext code
 * in `node_modules/vinext/dist` on disk. This is very dangerous and can break
 * routing, layout rendering, or cause compatibility failures on dependency updates.
 * Enable only if you explicitly need these fixes and understand the risks.
 */
export interface VinextRouteWiringFixPluginOptions {
    /**
     * Fix prefetch loading shell and nested route Suspense boundary wiring so
     * route-specific loading boundaries take precedence over root/ancestor skeletons.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server runtime on disk.
     * @default true
     */
    routeWiring?: boolean;

    /**
     * Fix route matching so a leading `:locale` segment is tried against the active
     * locale before falling back to a locale-less match.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server routing on disk.
     * @default true
     */
    routeMatching?: boolean;

    /**
     * Fix optimistic (client-side) routing so a leading `:locale` segment is tried
     * against the active locale before falling back to a locale-less match.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext client router on disk.
     * @default true
     */
    optimisticRouting?: boolean;

    /**
     * Fix optimistic route-shell learning so a navigation whose target prefetch is
     * still in flight waits for it, instead of falling back to the full navigation
     * response and leaving the previous page on screen.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext client route learning on disk.
     * @default true
     */
    prefetchLearning?: boolean;

    /**
     * Fix App Router layout/page subtree probe so React.Suspense boundaries
     * are respected (probe visits fallback and does not block/await async server components).
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server probe on disk.
     * @default true
     */
    suspenseProbe?: boolean;

    /**
     * Release a render dependency when its component suspends, so a `<Suspense>`
     * boundary no longer blocks the rest of the page from rendering.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server render dependencies on disk.
     * @default true
     */
    renderDependency?: boolean;

    /**
     * Lower the fixed 3000ms safety-cap timeout inside the browser's
     * optimistic-route-template-learning loop, so one slow/stuck prefetch
     * entry can't hold up the CURRENT live navigation for seconds.
     *
     * Pass a number to override the cap in ms; 200ms is the measured default
     * that keeps page-to-page switching instant.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext browser entry on disk.
     * @default true
     */
    optimisticLearningTimeout?: boolean | number;

    /**
     * Release the PAGE component's own render dependency on suspension
     * unconditionally, not only when the route has a loading boundary.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server page-element builder on disk.
     * @default true
     */
    pageInvokerSuspensionRelease?: boolean;

    /**
     * Strip vinext's render-dependency ordering from layouts, templates, slots,
     * the route element and the page element.
     *
     * On by default.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext server route wiring on disk.
     * @default true
     */
    unblockRenderDependencies?: boolean;

    /**
     * Also drop `pageDependencies` from the PAGE element itself.
     * @default false
     */
    unblockPageElementDependencies?: boolean;

    /**
     * Defer a `refresh()` navigation while a normal page-to-page navigation is
     * still in flight, so the refresh cannot cancel the user's route switch.
     *
     * ⚠️ **DANGER**: Monkey-patches vinext browser navigation controller on disk.
     * @default true
     */
    refreshDeferral?: boolean;
}

export function vinextRouteWiringFixPlugin(options: VinextRouteWiringFixPluginOptions = {}): Plugin {
    console.warn(
        "[cloudflare-next-intl] WARNING: vinextRouteWiringFix is enabled. Monkey-patching vinext on disk is dangerous and can break routing or upstream compatibility.",
    );
    const routeWiring = options.routeWiring !== false;
    const routeMatching = options.routeMatching !== false;
    const optimisticRouting = options.optimisticRouting !== false;
    const prefetchLearning = options.prefetchLearning !== false;
    const suspenseProbe = options.suspenseProbe !== false;
    const renderDependency = options.renderDependency !== false;
    const optimisticLearningTimeout = options.optimisticLearningTimeout !== false;
    const optimisticLearningTimeoutMs = typeof options.optimisticLearningTimeout === "number" ? options.optimisticLearningTimeout : undefined;
    const pageInvokerSuspensionRelease = options.pageInvokerSuspensionRelease !== false;
    const unblockRenderDependencies = options.unblockRenderDependencies !== false;
    const unblockPageElementDependencies = options.unblockPageElementDependencies === true;
    const refreshDeferral = options.refreshDeferral !== false;

    return {
        name: "cfni:vinext-route-wiring-fix",
        enforce: "pre",
        configResolved(config) {
            const root = config.root || process.cwd();
            const changed = syncPatchVinextOnDisk(root, { routeWiring, routeMatching, optimisticRouting, prefetchLearning, suspenseProbe, renderDependency, optimisticLearningTimeout: options.optimisticLearningTimeout ?? true, pageInvokerSuspensionRelease, unblockRenderDependencies, unblockPageElementDependencies, refreshDeferral });
            const cacheDir = config.cacheDir || resolve(root, "node_modules/.vite");
            if (changed || isVinextOptimizeDepsCacheStale(root, cacheDir)) {
                const busted = bustVinextOptimizeDepsCache(cacheDir);
                if (busted) {
                    console.log("[cfni:vinext-route-wiring-fix] patched vinext on disk and cleared its stale Vite optimizeDeps cache — dependencies will re-bundle on next request.");
                }
            }
        },
        transform(code, id) {
            if (routeWiring && isAppPageRouteWiringFile(id)) {
                if (isAppPageRouteWiringAlreadyFixed(code, { unblockRenderDependencies, unblockPageElementDependencies }) || !hasRequiredSymbols(code, "routeWiring")) {
                    return;
                }
                const patched = patchAppPageRouteWiring(code, { unblockRenderDependencies, unblockPageElementDependencies });
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (routeMatching && isRouteMatchingFile(id)) {
                if (isRouteMatchingAlreadyFixed(code) || !hasRequiredSymbols(code, "routeMatching")) {
                    return;
                }
                const patched = patchRouteMatching(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if ((prefetchLearning && isPrefetchLearningFile(id)) || (optimisticLearningTimeout && isOptimisticLearningTimeoutFile(id)) || (refreshDeferral && isPrefetchLearningFile(id))) {
                let patched = code;
                if (prefetchLearning && isPrefetchLearningFile(id) && !isPrefetchLearningAlreadyFixed(patched) && hasRequiredSymbols(patched, "prefetchLearning")) {
                    patched = patchPrefetchLearning(patched);
                }
                if (optimisticLearningTimeout && isOptimisticLearningTimeoutFile(id)) {
                    patched = patchOptimisticLearningTimeout(patched, optimisticLearningTimeoutMs);
                }
                if (refreshDeferral) {
                    patched = patchRefreshDeferralEntry(patched);
                }
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (optimisticRouting && isOptimisticRoutingFile(id)) {
                if (isOptimisticRoutingAlreadyFixed(code) || !hasRequiredSymbols(code, "optimisticRouting")) {
                    return;
                }
                const patched = patchOptimisticRouting(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (renderDependency && isRenderDependencyFile(id)) {
                if (isRenderDependencyAlreadyFixed(code)) {
                    return;
                }
                const patched = patchRenderDependency(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (pageInvokerSuspensionRelease && isPageInvokerSuspensionReleaseFile(id)) {
                if (isPageInvokerSuspensionReleaseAlreadyFixed(code)) {
                    return;
                }
                const patched = patchPageInvokerSuspensionRelease(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (refreshDeferral && isRefreshDeferralNavControllerFile(id)) {
                if (isRefreshDeferralNavControllerAlreadyFixed(code)) {
                    return;
                }
                const patched = patchRefreshDeferralNavController(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
            if (suspenseProbe && isAppPageProbeFile(id)) {
                if (isAppPageProbeAlreadyFixed(code) || !hasRequiredSymbols(code, "suspenseProbe")) {
                    return;
                }
                const patched = patchAppPageProbe(code);
                if (patched === code) {
                    return;
                }
                return {
                    code: patched,
                    map: null,
                };
            }
        },
    };
}


