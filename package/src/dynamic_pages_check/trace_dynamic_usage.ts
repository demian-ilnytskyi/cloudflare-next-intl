import { detectDynamicUsage, type DynamicApiCheck, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { collectReachableFiles, type CollectReachableFilesIo } from './collect_reachable_files.js';
import type { AliasConfig } from './resolve_local_imports.js';

export type TraceDynamicUsageIo = CollectReachableFilesIo;

/** One dynamic-API signal, paired with the file whose text actually carried it. */
export interface DynamicSignal {
    /** Human-readable API name, as `detectDynamicUsage` names it (e.g. `'cookies()'`). */
    api: string;
    /** Absolute path of the file the signal was found in — the entry page itself, or any file in its traced import graph. */
    file: string;
    /** 1-based line, within `file`, that the api's first match starts on. */
    line: number;
}

export interface TraceDynamicUsageResult extends DynamicDetectionResult {
    /**
     * Every `(api, file)` pair found, in traversal order. The entry file comes
     * first, so the first entry for a given api is the shallowest place it
     * appears. Unlike `detectedDynamicApis` (a de-duplicated name list), this
     * says WHERE each signal came from — the difference between "this page is
     * dynamic" and "this page is dynamic because a helper six imports away
     * calls `cookies()`".
     */
    signals: DynamicSignal[];
}

/**
 * Same signal `detectDynamicUsage` finds in one file, but unioned across
 * that file's local (relative/alias) import graph (via
 * `collectReachableFiles`): a page whose own text looks static can still
 * depend — through an imported component or repository, several hops
 * away — on a call that reaches `cookies()` or a dynamic-wrapping helper,
 * invisible to a single-file scan. Only same-project files are opened; a
 * specifier that resolves to neither a relative path nor a configured
 * alias (an npm package) is left as opaque text, matching
 * `detectDynamicUsage`'s own text-only, no-compiler-API design.
 */
export function traceDynamicUsage(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: TraceDynamicUsageIo,
    extraChecks: readonly DynamicApiCheck[] = [],
): TraceDynamicUsageResult {
    const files = collectReachableFiles(entryFile, entrySource, aliases, io);

    let hasExplicitDynamicExport = false;
    const detectedApis = new Set<string>();
    const signals: DynamicSignal[] = [];
    let first = true;
    for (const [file, source] of files.entries()) {
        const detection = detectDynamicUsage(source, extraChecks);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.matches.forEach(({ name, line }) => {
            detectedApis.add(name);
            signals.push({ api: name, file, line });
        });
    }

    return {
        hasExplicitDynamicExport,
        detectedDynamicApis: [...detectedApis],
        matches: signals.map(({ api, line }) => ({ name: api, line })),
        signals,
    };
}
