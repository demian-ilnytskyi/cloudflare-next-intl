const IMPORT_STATEMENT = /^import[\s\S]*?;\s*$/gm;

/**
 * Inserts `export const dynamic = "<value>";` right after the last
 * top-level `import` statement (or at the very top of the file when there
 * are none), preceded by a marker comment so a human reading the file later
 * knows this line was machine-added and how to remove/override it.
 */
export function insertDynamicExport(sourceText: string, value: 'force-static' | 'force-dynamic'): string {
    const block = `// Auto-inserted by cloudflare-next-intl's checkDynamicPages (mode: "fix") — remove this line, or set \`dynamic\` yourself, to override.\nexport const dynamic = "${value}";\n`;

    let lastImportEnd = -1;
    for (const match of sourceText.matchAll(IMPORT_STATEMENT)) {
        lastImportEnd = match.index! + match[0].length;
    }

    if (lastImportEnd === -1) {
        return `${block}\n${sourceText}`;
    }
    const before = sourceText.slice(0, lastImportEnd).replace(/\n+$/, '');
    const after = sourceText.slice(lastImportEnd).replace(/^\n+/, '');
    return `${before}\n\n${block}\n${after}`;
}
