import { extractImportSpecifiers, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';
import { USE_CLIENT_DIRECTIVE } from './detect_dynamic_usage.js';

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
 *
 * A `"use server"` file IS opened and included: its exports aren't only
 * form-bound Server Actions invoked later by user interaction — a common,
 * legitimate pattern calls them directly as plain async functions during
 * the SAME render (`await someRepository.fetchThing(id)` inside a Server
 * Component's body), same timing as any other import. Treating such a file
 * as opaque hid real dynamic-API usage (e.g. `getAuthUser()`) behind it,
 * which is exactly backwards from this scan's own stated bias: a false
 * positive here only costs an unnecessary `force-dynamic`, but a false
 * negative silently mis-marks a genuinely per-user page as static.
 *
 * The one boundary that DOES stop traversal is a `"use client"` file: only
 * ITS own text is scanned, its imports aren't queued. Anything reached only
 * through a Client Component — most commonly a `"use server"` action bound
 * to an event handler for later user-triggered RPC — never runs during the
 * server render that decides whether the page itself is static or dynamic,
 * so it carries no signal for that render. Unlike the `"use server"` case
 * above, opening it costs the "safe side" a real, common false positive
 * (any page whose error/retry UI imports a cookie-clearing Server Action
 * behind a client boundary gets force-dynamic for no reason) instead of
 * guarding against a false negative.
 *
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

        // Everything a Client Component imports — a "use server" action
        // bound to an onClick/form included — only runs later via an RPC
        // the browser triggers, never during the server render that decides
        // whether THIS page is static or dynamic. Stop tracing past it
        // (the client file's own text is still scanned by detectDynamicUsage
        // for its own directly-visible signals).
        if (USE_CLIENT_DIRECTIVE.test(source)) continue;

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
