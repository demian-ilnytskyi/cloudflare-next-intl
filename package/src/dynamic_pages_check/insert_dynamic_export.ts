/**
 * Finds the end of the file's leading run of `import` statements by walking
 * line by line from the top and tracking brace/paren/bracket depth, rather
 * than a single regex spanning the whole file — a lazy `[\s\S]*?;` regex can
 * jump from an `import` keyword clear across unrelated code to a much later
 * semicolon (e.g. a string or object literal containing one), which would
 * insert the export in the middle of a statement. Stops at the first line
 * that isn't blank, a comment, or part of an import statement, so the worst
 * case is stopping early (falls back to inserting at the top of the file)
 * rather than inserting somewhere unsafe.
 */
function findLeadingImportBlockEnd(sourceText: string): number {
    const lines = sourceText.split('\n');
    let offset = 0;
    let lastImportEnd = -1;
    let depth = 0;
    let inImport = false;

    for (const line of lines) {
        const lineEnd = offset + line.length;
        const trimmed = line.trim();

        if (!inImport) {
            if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                offset = lineEnd + 1;
                continue;
            }
            if (!/^import\b/.test(trimmed)) break;
            inImport = true;
            depth = 0;
        }

        for (const char of line) {
            if (char === '{' || char === '(' || char === '[') depth += 1;
            else if (char === '}' || char === ')' || char === ']') depth -= 1;
        }

        if (inImport && depth <= 0 && /;\s*$/.test(line)) {
            inImport = false;
            lastImportEnd = lineEnd;
        }

        offset = lineEnd + 1;
    }

    return lastImportEnd;
}

/**
 * Inserts `export const dynamic = "<value>";` right after the file's
 * leading run of `import` statements (or at the very top of the file when
 * there are none), preceded by a marker comment so a human reading the file
 * later knows this line was machine-added and how to remove/override it.
 */
export function insertDynamicExport(sourceText: string, value: 'force-static' | 'force-dynamic'): string {
    const block = `// Auto-inserted by cloudflare-next-intl's checkDynamicPages (mode: "fix") — remove this line, or set \`dynamic\` yourself, to override.\nexport const dynamic = "${value}";\n`;

    const lastImportEnd = findLeadingImportBlockEnd(sourceText);
    if (lastImportEnd === -1) {
        return `${block}\n${sourceText}`;
    }
    const before = sourceText.slice(0, lastImportEnd).replace(/\n+$/, '');
    const after = sourceText.slice(lastImportEnd).replace(/^\n+/, '');
    return `${before}\n\n${block}\n${after}`;
}
