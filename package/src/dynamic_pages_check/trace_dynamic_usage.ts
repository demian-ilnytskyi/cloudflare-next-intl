import { detectDynamicUsage, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { extractImportSpecifiers, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';

export interface TraceDynamicUsageIo {
    readFile: (file: string) => string;
    isFile?: (file: string) => boolean;
}

/**
 * Safety cap on how many local files one page's import graph can pull in
 * before traversal stops. A runaway or accidentally-cyclic graph should
 * degrade to "some signals possibly missed", never to a full-project scan.
 */
const MAX_FILES_VISITED = 300;

/**
 * Same signal `detectDynamicUsage` finds in one file, but unioned across
 * that file's local (relative/alias) import graph: a page whose own text
 * looks static can still depend — through an imported component or
 * repository, several hops away — on a call that reaches `cookies()` or a
 * dynamic-wrapping helper, invisible to a single-file scan. Only
 * same-project files are opened; a specifier that resolves to neither a
 * relative path nor a configured alias (an npm package) is left as opaque
 * text, matching `detectDynamicUsage`'s own text-only, no-compiler-API
 * design.
 */
export function traceDynamicUsage(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: TraceDynamicUsageIo,
): DynamicDetectionResult {
    const isFile = io.isFile ?? (() => false);

    const visited = new Set<string>([entryFile]);
    const queue: { file: string; source: string }[] = [{ file: entryFile, source: entrySource }];

    let hasExplicitDynamicExport = false;
    const detectedApis = new Set<string>();
    let first = true;

    while (queue.length > 0) {
        const current = queue.shift()!;
        const detection = detectDynamicUsage(current.source);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.detectedDynamicApis.forEach((api) => detectedApis.add(api));

        if (visited.size >= MAX_FILES_VISITED) continue;

        for (const specifier of extractImportSpecifiers(current.source)) {
            if (visited.size >= MAX_FILES_VISITED) break;
            const resolved = resolveLocalImport(specifier, current.file, aliases, isFile);
            if (resolved === null || visited.has(resolved)) continue;
            visited.add(resolved);

            let importedSource: string;
            try {
                importedSource = io.readFile(resolved);
            } catch {
                continue;
            }
            queue.push({ file: resolved, source: importedSource });
        }
    }

    return { hasExplicitDynamicExport, detectedDynamicApis: [...detectedApis] };
}
