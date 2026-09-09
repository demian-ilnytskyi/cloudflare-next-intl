function findLeadingImportBlockEnd(sourceText) {
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
            if (!/^import\b/.test(trimmed))
                break;
            inImport = true;
            depth = 0;
        }
        for (const char of line) {
            if (char === '{' || char === '(' || char === '[')
                depth += 1;
            else if (char === '}' || char === ')' || char === ']')
                depth -= 1;
        }
        if (inImport && depth <= 0 && /;\s*$/.test(line)) {
            inImport = false;
            lastImportEnd = lineEnd;
        }
        offset = lineEnd + 1;
    }
    return lastImportEnd;
}
export function insertDynamicExport(sourceText, value) {
    const block = `// Auto-inserted by cloudflare-next-intl's checkDynamicPages (mode: "fix") — remove this line, or set \`dynamic\` yourself, to override.\nexport const dynamic = "${value}";\n`;
    const lastImportEnd = findLeadingImportBlockEnd(sourceText);
    if (lastImportEnd === -1) {
        return `${block}\n${sourceText}`;
    }
    const before = sourceText.slice(0, lastImportEnd).replace(/\n+$/, '');
    const after = sourceText.slice(lastImportEnd).replace(/^\n+/, '');
    return `${before}\n\n${block}\n${after}`;
}
