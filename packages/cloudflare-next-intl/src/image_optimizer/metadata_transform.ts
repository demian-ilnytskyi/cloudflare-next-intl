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

/**
 * True when the string at `offset` in a metadata block is an Apple touch icon
 * (`icons.apple`, or an icon object with `rel: "apple-touch-icon"`). iOS does
 * not accept WebP/AVIF touch icons, so those keep their original file.
 */
export function isAppleIconAt(block: string, offset: number): boolean {
    let depth = 0;
    let start = -1;
    for (let i = offset - 1; i >= 0; i--) {
        const char = block[i];
        if (char === "}") depth++;
        else if (char === "{") {
            if (depth === 0) {
                start = i;
                break;
            }
            depth--;
        }
    }
    const appleKey = /\bapple\s*:\s*(?:\[[^\]]*)?$/;
    if (appleKey.test(block.slice(Math.max(0, start), offset))) return true;
    if (start === -1) return false;
    const end = findBalancedBraces(block, start);
    if (/apple-touch-icon/.test(block.slice(start, end === -1 ? offset : end + 1))) return true;
    return appleKey.test(block.slice(0, start));
}

const MIME_BY_EXTENSION: Record<string, string> = {
    webp: "image/webp",
    avif: "image/avif",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
};

function syncIconTypes(block: string, rewritten: Set<string>): string {
    return block.replace(/\{[^{}]*\}/g, (object) => {
        const src = [...rewritten].find((value) => object.includes(value));
        if (!src) return object;
        const mime = MIME_BY_EXTENSION[src.split(".").pop()!.toLowerCase()];
        if (!mime) return object;
        return object.replace(/(\btype\s*:\s*)(["'`])image\/[a-z+.-]+\2/, `$1$2${mime}$2`);
    });
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

        const rewritten = new Set<string>();
        const transformedBlock = block.replace(
            /(["'`])([^"'`\s\n\r#?]+\.(?:png|jpg|jpeg|webp|avif))(?:\?[^"'`\s]*)?(?:#[^"'`\s]*)?\1/gi,
            (fullMatch: string, quote: string, rawPath: string, offset: number) => {
                const key = normalizeSrcKey(rawPath);
                const entry = manifestImages[key];
                if (entry && entry.src && !isAppleIconAt(block, offset)) {
                    modified = true;
                    rewritten.add(entry.src);
                    return `${quote}${entry.src}${quote}`;
                }
                return fullMatch;
            },
        );

        result += rewritten.size > 0 ? syncIconTypes(transformedBlock, rewritten) : transformedBlock;
        lastIndex = range.end + 1;
    }

    result += code.slice(lastIndex);
    return modified ? result : undefined;
}

