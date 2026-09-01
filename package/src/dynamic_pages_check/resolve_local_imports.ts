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
