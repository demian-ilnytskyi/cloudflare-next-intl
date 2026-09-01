import { detectDynamicUsage, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { collectReachableFiles, type CollectReachableFilesIo } from './collect_reachable_files.js';
import type { AliasConfig } from './resolve_local_imports.js';

export type TraceDynamicUsageIo = CollectReachableFilesIo;

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
): DynamicDetectionResult {
    const files = collectReachableFiles(entryFile, entrySource, aliases, io);

    let hasExplicitDynamicExport = false;
    const detectedApis = new Set<string>();
    let first = true;
    for (const source of files.values()) {
        const detection = detectDynamicUsage(source);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.detectedDynamicApis.forEach((api) => detectedApis.add(api));
    }

    return { hasExplicitDynamicExport, detectedDynamicApis: [...detectedApis] };
}
