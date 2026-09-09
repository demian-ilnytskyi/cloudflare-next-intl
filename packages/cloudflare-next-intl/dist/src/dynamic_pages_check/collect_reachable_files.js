import { extractImportBindings, resolveLocalImport } from './resolve_local_imports.js';
import { stripComments, USE_CLIENT_DIRECTIVE } from './detect_dynamic_usage.js';
export const MAX_FILES_VISITED = 300;
function blankSpans(code, spans) {
    let out = code;
    for (const { start, end } of spans) {
        out = out.slice(0, start) + [...out.slice(start, end)].map((c) => (c === '\n' ? '\n' : ' ')).join('') + out.slice(end);
    }
    return out;
}
function isWordUsed(name, text) {
    return new RegExp(`\\b${name}\\b`).test(text);
}
export function collectReachableFiles(entryFile, entrySource, aliases, io) {
    const isFile = io.isFile ?? (() => false);
    const files = new Map([[entryFile, entrySource]]);
    const queue = [entryFile];
    while (queue.length > 0) {
        const current = queue.shift();
        if (files.size >= MAX_FILES_VISITED)
            continue;
        const source = files.get(current);
        if (USE_CLIENT_DIRECTIVE.test(source))
            continue;
        const code = stripComments(source);
        const imports = extractImportBindings(code);
        const usageText = blankSpans(code, imports);
        for (const { specifier, bindings, alwaysFollow } of imports) {
            if (files.size >= MAX_FILES_VISITED)
                break;
            if (!alwaysFollow && bindings.length > 0 && !bindings.some((name) => isWordUsed(name, usageText))) {
                continue;
            }
            const resolved = resolveLocalImport(specifier, current, aliases, isFile);
            if (resolved === null || files.has(resolved))
                continue;
            let importedSource;
            try {
                importedSource = io.readFile(resolved);
            }
            catch {
                continue;
            }
            files.set(resolved, importedSource);
            queue.push(resolved);
        }
    }
    return files;
}
