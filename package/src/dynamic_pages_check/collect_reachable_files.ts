import { extractImportSpecifiers, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';

export interface CollectReachableFilesIo {
    readFile: (file: string) => string;
    isFile?: (file: string) => boolean;
}

/**
 * Safety cap on how many local files one entry point's import graph can
 * pull in before traversal stops. A runaway or accidentally-cyclic graph
 * should degrade to "some files possibly missed", never to a full-project
 * scan.
 */
export const MAX_FILES_VISITED = 300;

/**
 * Walks `entryFile`'s local (relative/alias) import graph — cycle-safe,
 * capped at {@link MAX_FILES_VISITED} — and returns every file reached,
 * `entryFile` included (inserted first, so callers that care about
 * iteration order can rely on it coming first), mapped to its source text.
 * Shared by `traceDynamicUsage` (unions `detectDynamicUsage` signals across
 * this set) and `syncErrorReportingAuthUser` (finds `reportError()` calls
 * across this set) so both walk the exact same graph by construction.
 */
export function collectReachableFiles(
    entryFile: string,
    entrySource: string,
    aliases: readonly AliasConfig[],
    io: CollectReachableFilesIo,
): Map<string, string> {
    const isFile = io.isFile ?? (() => false);
    const files = new Map<string, string>([[entryFile, entrySource]]);
    const queue: string[] = [entryFile];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (files.size >= MAX_FILES_VISITED) continue;
        const source = files.get(current)!;

        for (const specifier of extractImportSpecifiers(source)) {
            if (files.size >= MAX_FILES_VISITED) break;
            const resolved = resolveLocalImport(specifier, current, aliases, isFile);
            if (resolved === null || files.has(resolved)) continue;

            let importedSource: string;
            try {
                importedSource = io.readFile(resolved);
            } catch {
                continue;
            }
            files.set(resolved, importedSource);
            queue.push(resolved);
        }
    }

    return files;
}
