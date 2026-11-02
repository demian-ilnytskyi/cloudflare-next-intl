export function findBalancedBraces(code: string, openIndex: number): number {
    if (code[openIndex] !== "{") return -1;
    let depth = 0;
    let inString: string | null = null;
    let inComment: "line" | "block" | null = null;

    for (let i = openIndex; i < code.length; i++) {
        const char = code[i];
        const next = code[i + 1];

        if (inComment === "line") {
            if (char === "\n") inComment = null;
            continue;
        }
        if (inComment === "block") {
            if (char === "*" && next === "/") {
                inComment = null;
                i++;
            }
            continue;
        }

        if (inString) {
            if (char === "\\") {
                i++; // skip escaped char
            } else if (char === inString) {
                inString = null;
            }
            continue;
        }

        if (char === "/" && next === "/") {
            inComment = "line";
            i++;
            continue;
        }
        if (char === "/" && next === "*") {
            inComment = "block";
            i++;
            continue;
        }

        if (char === '"' || char === "'" || char === "`") {
            inString = char;
            continue;
        }

        if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

export function getMetadataRanges(code: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];

    // Match metadata object: `metadata = { ... }` or `metadata: Metadata = { ... }`
    const metadataDeclPattern = /\bmetadata\s*(?::\s*[A-Za-z0-9_$.<>[\]\s]+)?\s*=\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = metadataDeclPattern.exec(code)) !== null) {
        const openIndex = match.index + match[0].length - 1;
        const closeIndex = findBalancedBraces(code, openIndex);
        if (closeIndex !== -1) {
            ranges.push({ start: openIndex, end: closeIndex });
        }
    }

    // Match generateMetadata: `function generateMetadata(...) { ... }`
    const genMetadataPattern = /(?:async\s+)?function\s+generateMetadata\b[^{]*\{/g;
    while ((match = genMetadataPattern.exec(code)) !== null) {
        const openIndex = match.index + match[0].length - 1;
        const closeIndex = findBalancedBraces(code, openIndex);
        if (closeIndex !== -1) {
            ranges.push({ start: openIndex, end: closeIndex });
        }
    }

    // Match standalone metadata property blocks: `openGraph: {`, `twitter: {`, `icons: {`
    const propPattern = /\b(openGraph|twitter|icons)\s*:\s*\{/g;
    while ((match = propPattern.exec(code)) !== null) {
        const openIndex = match.index + match[0].length - 1;
        // Avoid duplicating if already inside a metadata range
        const insideExisting = ranges.some((r) => openIndex >= r.start && openIndex <= r.end);
        if (!insideExisting) {
            const closeIndex = findBalancedBraces(code, openIndex);
            if (closeIndex !== -1) {
                ranges.push({ start: openIndex, end: closeIndex });
            }
        }
    }

    return ranges;
}

function normalizeSrcKey(src: string): string {
    const clean = src.split("?")[0].split("#")[0];
    return clean.startsWith("/") ? clean : `/${clean}`;
}

export function transformMetadataImageUrls(
    code: string,
    manifestImages: Record<string, { src: string }>,
): string | undefined {
    if (Object.keys(manifestImages).length === 0) return undefined;

    // Fast check before doing AST/range extraction
    if (!/\b(metadata|generateMetadata|openGraph|twitter|icons)\b/.test(code)) {
        return undefined;
    }

    const ranges = getMetadataRanges(code);
    if (ranges.length === 0) return undefined;

    let modified = false;
    let result = "";
    let lastIndex = 0;

    // Sort ranges by start
    ranges.sort((a, b) => a.start - b.start);

    for (const range of ranges) {
        result += code.slice(lastIndex, range.start);
        const block = code.slice(range.start, range.end + 1);

        const transformedBlock = block.replace(
            /(["'`])([^"'`\s\n\r#?]+\.(?:png|jpg|jpeg|webp|avif))(?:\?[^"'`\s]*)?(?:#[^"'`\s]*)?\1/gi,
            (fullMatch, quote, rawPath) => {
                const key = normalizeSrcKey(rawPath);
                const entry = manifestImages[key];
                if (entry && entry.src) {
                    modified = true;
                    return `${quote}${entry.src}${quote}`;
                }
                return fullMatch;
            },
        );

        result += transformedBlock;
        lastIndex = range.end + 1;
    }

    result += code.slice(lastIndex);
    return modified ? result : undefined;
}

