import { extractImportBindings, resolveLocalImport, type AliasConfig } from './resolve_local_imports.js';
import { stripComments, USE_CLIENT_DIRECTIVE } from './detect_dynamic_usage.js';

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

/** `code` with every `[start, end)` span from `spans` blanked to spaces (newlines kept), so a binding's own import line can't count as a "usage" of itself. */
function blankSpans(code: string, spans: readonly { start: number; end: number }[]): string {
    let out = code;
    for (const { start, end } of spans) {
        out = out.slice(0, start) + [...out.slice(start, end)].map((c) => (c === '\n' ? '\n' : ' ')).join('') + out.slice(end);
    }
    return out;
}

/** Whether `name` appears as a whole word anywhere in `text` — used to decide if an import's binding is referenced outside its own `import` line. */
function isWordUsed(name: string, text: string): boolean {
    return new RegExp(`\\b${name}\\b`).test(text);
}

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
 *
 * A THIRD boundary — narrower than either of the above — is an import whose
 * local binding is never referenced anywhere else in the file: a real
 * pattern, not a hypothetical one (a call site gets deleted in a refactor,
 * the `import` line above it doesn't). Such a file is never actually
 * reached at render time no matter what it contains, so it isn't opened.
 * `bindingUsedElsewhere` decides this — conservatively: any binding this
 * text scan can't rule out as used stays in, so a real but unusually-shaped
 * usage (e.g. only inside a type position, or shadowed by an unrelated
 * local of the same name) still gets traced rather than silently dropped.
 * `export ... from` re-exports and bare `import '...'` side effects have no
 * local binding to check and are always followed.
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

        const code = stripComments(source);
        const imports = extractImportBindings(code);
        const usageText = blankSpans(code, imports);

        for (const { specifier, bindings, alwaysFollow } of imports) {
            if (files.size >= MAX_FILES_VISITED) break;
            if (!alwaysFollow && bindings.length > 0 && !bindings.some((name) => isWordUsed(name, usageText))) {
                continue; // every binding this import introduces is unreferenced: dead import, nothing to trace into
            }
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
