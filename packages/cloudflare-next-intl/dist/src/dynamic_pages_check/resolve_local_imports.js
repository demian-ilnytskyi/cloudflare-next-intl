import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT_SPECIFIER = /(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g;
export function extractImportSpecifiers(sourceText) {
    const specifiers = [];
    FROM_SPECIFIER.lastIndex = 0;
    let match;
    while ((match = FROM_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }
    BARE_IMPORT_SPECIFIER.lastIndex = 0;
    while ((match = BARE_IMPORT_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }
    return specifiers;
}
const FROM_IMPORT_STATEMENT = /\b(import|export)\s+type\s+|\b(import|export)\s+([\s\S]*?)\s*from\s*(['"])([^'"]+)\4/g;
const BARE_IMPORT_STATEMENT = /(?:^|\n|;)\s*(import\s*(['"])([^'"]+)\2)/g;
function bindingsFromClause(clause) {
    const bindings = [];
    const namespaceMatch = /^\*\s*as\s+(\w+)$/.exec(clause.trim());
    if (namespaceMatch)
        return [namespaceMatch[1]];
    const braceMatch = /\{([^}]*)\}/.exec(clause);
    if (braceMatch) {
        for (const rawItem of braceMatch[1].split(',')) {
            const item = rawItem.trim().replace(/^type\s+/, '');
            if (item.length === 0)
                continue;
            const asMatch = /\bas\s+(\w+)$/.exec(item);
            bindings.push(asMatch ? asMatch[1] : item);
        }
    }
    const beforeBrace = clause.slice(0, braceMatch?.index ?? clause.length).replace(/,\s*$/, '').trim();
    if (/^\w+$/.test(beforeBrace))
        bindings.push(beforeBrace);
    return bindings;
}
export function extractImportBindings(sourceText) {
    const results = [];
    FROM_IMPORT_STATEMENT.lastIndex = 0;
    let match;
    while ((match = FROM_IMPORT_STATEMENT.exec(sourceText)) !== null) {
        if (match[1] !== undefined || match[2] === undefined)
            continue;
        const keyword = match[2];
        const clause = match[3];
        const specifier = match[5];
        results.push({
            specifier,
            bindings: keyword === 'export' ? [] : bindingsFromClause(clause),
            alwaysFollow: keyword === 'export',
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    BARE_IMPORT_STATEMENT.lastIndex = 0;
    while ((match = BARE_IMPORT_STATEMENT.exec(sourceText)) !== null) {
        const statement = match[1];
        const statementStart = match.index + match[0].indexOf(statement);
        results.push({
            specifier: match[3],
            bindings: [],
            alwaysFollow: true,
            start: statementStart,
            end: statementStart + statement.length,
        });
    }
    return results;
}
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
function defaultIsFile(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
export function resolveLocalImport(specifier, fromFile, aliases, isFile = defaultIsFile) {
    let base = null;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        base = resolve(dirname(fromFile), specifier);
    }
    else {
        for (const alias of aliases) {
            if (specifier.startsWith(alias.prefix)) {
                base = join(alias.replacement, specifier.slice(alias.prefix.length));
                break;
            }
        }
    }
    if (base === null)
        return null;
    if (isFile(base))
        return base;
    for (const ext of FILE_EXTENSIONS) {
        const candidate = `${base}${ext}`;
        if (isFile(candidate))
            return candidate;
    }
    for (const ext of FILE_EXTENSIONS) {
        const candidate = join(base, `index${ext}`);
        if (isFile(candidate))
            return candidate;
    }
    return null;
}
