import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface AliasConfig {
    /** e.g. `'@/'` */
    prefix: string;
    /** Absolute directory the prefix resolves to. */
    replacement: string;
}

// Matches `from '...'` (covers `import ... from`, `import type ... from`,
// and `export ... from`) and bare `import '...'` side-effect imports.
// Text-based, same class of heuristic as detectDynamicUsage — good enough
// for this project's own import styles, not a full ES-module parser.
const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT_SPECIFIER = /(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g;

/** Extracts every `from '...'` and bare `import '...'` specifier from a file's source text, in the order they appear. */
export function extractImportSpecifiers(sourceText: string): string[] {
    const specifiers: string[] = [];

    FROM_SPECIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FROM_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }

    BARE_IMPORT_SPECIFIER.lastIndex = 0;
    while ((match = BARE_IMPORT_SPECIFIER.exec(sourceText)) !== null) {
        specifiers.push(match[1]);
    }

    return specifiers;
}

export interface ImportBindingInfo {
    /** The `from '...'` module specifier. */
    specifier: string;
    /** Local names this statement introduces (`b` for `import { a as b }`, `ns` for `import * as ns`, the identifier for a default import). Empty for a bare side-effect `import '...'`. */
    bindings: string[];
    /**
     * `true` for a bare `import '...'` or any `export ... from '...'`
     * re-export — there's no local binding whose usage could be checked
     * (a re-export's "usage" is external, by other modules importing THIS
     * one), so these are always worth following regardless of `bindings`.
     */
    alwaysFollow: boolean;
    /** Character offset where this statement starts in the source. */
    start: number;
    /** Character offset just past this statement's closing `from '...'`/`'...'`. */
    end: number;
}

// Matches an `import`/`export` clause up to its `from '...'` — the lazy
// `[\s\S]*?` stops at the nearest `from`, which is the statement's own for
// any normally-formatted import (this is the same class of text heuristic
// as the rest of this file: good enough for this project's style, not a
// full parser).
const FROM_IMPORT_STATEMENT = /\b(import|export)\s+type\s+|\b(import|export)\s+([\s\S]*?)\s*from\s*(['"])([^'"]+)\4/g;
const BARE_IMPORT_STATEMENT = /(?:^|\n|;)\s*(import\s*(['"])([^'"]+)\2)/g;

/** Local binding name(s) an import/export clause (the text between `import`/`export` and `from`) introduces. */
function bindingsFromClause(clause: string): string[] {
    const bindings: string[] = [];
    const namespaceMatch = /^\*\s*as\s+(\w+)$/.exec(clause.trim());
    if (namespaceMatch) return [namespaceMatch[1]!];
    if (clause.trim() === '*') return []; // `export * from '...'` — no local binding, always-follow handles it

    const braceMatch = /\{([^}]*)\}/.exec(clause);
    if (braceMatch) {
        for (const rawItem of braceMatch[1]!.split(',')) {
            const item = rawItem.trim().replace(/^type\s+/, '');
            if (item.length === 0) continue;
            const asMatch = /\bas\s+(\w+)$/.exec(item);
            bindings.push(asMatch ? asMatch[1]! : item);
        }
    }

    const beforeBrace = clause.slice(0, braceMatch?.index ?? clause.length).replace(/,\s*$/, '').trim();
    if (/^\w+$/.test(beforeBrace)) bindings.push(beforeBrace);

    return bindings;
}

/**
 * Every `import`/`export ... from` statement in `sourceText`, each paired
 * with the local name(s) it introduces — so a caller can tell an import
 * whose binding is never referenced again (a leftover from a refactor: the
 * call site was deleted, the `import` line wasn't) from one that's actually
 * exercised. `import type` clauses are skipped entirely: a type never
 * executes, so it carries no dynamic-API signal to trace into regardless of
 * whether it's "used".
 */
export function extractImportBindings(sourceText: string): ImportBindingInfo[] {
    const results: ImportBindingInfo[] = [];

    FROM_IMPORT_STATEMENT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FROM_IMPORT_STATEMENT.exec(sourceText)) !== null) {
        if (match[1] !== undefined || match[2] === undefined) continue; // `import type .../export type ...`: skipped
        const keyword = match[2];
        const clause = match[3]!;
        const specifier = match[5]!;
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
        const statement = match[1]!;
        const statementStart = match.index + match[0].indexOf(statement);
        results.push({
            specifier: match[3]!,
            bindings: [],
            alwaysFollow: true,
            start: statementStart,
            end: statementStart + statement.length,
        });
    }

    return results;
}

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function defaultIsFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

/**
 * Resolves a relative (`./`, `../`) or alias-prefixed import specifier to an
 * existing local file, trying the specifier as given, each of
 * `FILE_EXTENSIONS` appended, then each extension under an `index` file
 * (for a specifier that names a directory). Returns `null` for a bare
 * package specifier that matches no configured alias, or one that doesn't
 * resolve to a real file under any of those candidates.
 */
export function resolveLocalImport(
    specifier: string,
    fromFile: string,
    aliases: readonly AliasConfig[],
    isFile: (file: string) => boolean = defaultIsFile,
): string | null {
    let base: string | null = null;

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        base = resolve(dirname(fromFile), specifier);
    } else {
        for (const alias of aliases) {
            if (specifier.startsWith(alias.prefix)) {
                base = join(alias.replacement, specifier.slice(alias.prefix.length));
                break;
            }
        }
    }

    if (base === null) return null;
    if (isFile(base)) return base;

    for (const ext of FILE_EXTENSIONS) {
        const candidate = `${base}${ext}`;
        if (isFile(candidate)) return candidate;
    }
    for (const ext of FILE_EXTENSIONS) {
        const candidate = join(base, `index${ext}`);
        if (isFile(candidate)) return candidate;
    }
    return null;
}
