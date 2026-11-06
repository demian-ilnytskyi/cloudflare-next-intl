import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getMetadataRanges, isAppleIconAt } from "./metadata_transform.js";
import type { ImageFormat, ImageOverrideOptions } from "./types.js";

export const CODE_EXTENSIONS: readonly string[] = [
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".mjs",
    ".cjs",
    ".astro",
    ".vue",
    ".svelte",
    ".mdx",
    ".html",
];

export const ASSET_EXTENSIONS: readonly string[] = [
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".json",
    ".md",
    ".sql",
    ".py",
];

export const SCANNED_EXTENSIONS: readonly string[] = [
    ...CODE_EXTENSIONS,
    ...ASSET_EXTENSIONS,
];

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
    "node_modules",
    ".git",
    ".next",
    ".vinext",
    "dist",
    "build",
    "out",
    "boundled",
    "bundled",
    ".wrangler",
    ".open-next",
    "coverage",
    ".cache",
    ".skeleton-diff",
    ".superpowers",
    "scripts",
    "tmp",
    ".tmp_figma",
    "generated",
    "docs",
    ".agent",
    ".claude",
    "screens",
    "e2e",
    "test",
    "tests",
    ".husky",
    ".github",
]);

export const IGNORED_FILES: ReadonlySet<string> = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "shrinkwrap.yaml",
    "images.json",
]);

export async function findCodeFiles(
    dir: string,
    found: string[] = [],
    extensions: readonly string[] = CODE_EXTENSIONS,
): Promise<string[]> {
    let items;
    try {
        items = await readdir(dir, { withFileTypes: true });
    } catch {
        return found;
    }
    for (const item of items) {
        if (IGNORED_DIRS.has(item.name)) continue;
        if (IGNORED_FILES.has(item.name)) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            await findCodeFiles(full, found, extensions);
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            found.push(full);
        }
    }
    return found;
}

export function extractImageReferences(code: string): string[] {
    const refs = new Set<string>();
    const pattern = /(?:["'`])([^"'`\s\n\r#?]+\.(?:png|jpg|jpeg|webp|avif))(?:\?[^"'`\s]*|#[^"'`\s]*)?(?:["'`])/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
        const raw = match[1];
        if (raw) refs.add(raw);
    }
    return Array.from(refs);
}

/** Merges one override into a map by src, unioning `extraWidths` instead of letting the later usage overwrite the earlier one. */
function mergeOverrideInto(
    map: Record<string, ImageOverrideOptions>,
    src: string,
    override: ImageOverrideOptions,
): void {
    const existing = map[src];
    const mergedWidths = existing?.extraWidths || override.extraWidths
        ? Array.from(new Set([...(existing?.extraWidths ?? []), ...(override.extraWidths ?? [])]))
        : undefined;
    map[src] = { ...existing, ...override };
    if (mergedWidths) {
        map[src].extraWidths = mergedWidths;
    }
}

const IMAGE_FORMATS: readonly string[] = [
    "avif", "webp", "png", "jpeg", "gif", "tiff", "heif", "jp2", "jxl",
];

function parseFormatsAttr(raw: string): ImageFormat[] | false | undefined {
    const trimmed = raw.trim();
    if (trimmed === "false") return false;
    const values = trimmed.match(/[a-z0-9]+/gi) ?? [];
    const formats = values
        .map((v) => v.toLowerCase())
        .filter((v): v is ImageFormat => IMAGE_FORMATS.includes(v));
    return formats.length > 0 ? formats : undefined;
}

function parseNumberAttr(raw: string): number | undefined {
    const value = Number(raw.trim().replace(/[{}]/g, ""));
    return Number.isFinite(value) ? value : undefined;
}

function parseBlurAttr(raw: string): ImageOverrideOptions["blur"] {
    const trimmed = raw.trim();
    if (trimmed === "false") return false;
    if (trimmed === "true") return true;
    const blur: NonNullable<Exclude<ImageOverrideOptions["blur"], boolean>> = {};
    const size = trimmed.match(/size\s*:\s*(\d+)/);
    const quality = trimmed.match(/quality\s*:\s*(\d+)/);
    const stdDeviation = trimmed.match(/stdDeviation\s*:\s*(\d+)/);
    if (size) blur.size = Number(size[1]);
    if (quality) blur.quality = Number(quality[1]);
    if (stdDeviation) blur.stdDeviation = Number(stdDeviation[1]);
    return Object.keys(blur).length > 0 ? blur : undefined;
}

/**
 * Scans JSX/TSX source for <Image> tags carrying per-image optimizer props
 * (formats / blur / quality / maxWidth) and turns them into override entries
 * keyed by the tag's own src, so settings can live next to usage instead of
 * only in the plugin's centralized `overrides` config. Every tag's own
 * `width` prop is also collected into `extraWidths`, merged across all usages
 * of the same src, so the same image used at different sizes (a thumbnail and
 * a hero, say) gets a separate generated variant for each size instead of one
 * usage's width silently overwriting another's.
 */
export function extractImageOverrides(code: string): Record<string, ImageOverrideOptions> {
    const overrides: Record<string, ImageOverrideOptions> = {};
    const tagPattern = /<Image\b([^>]*)\/?>/gs;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagPattern.exec(code)) !== null) {
        const attrs = tagMatch[1];
        const srcMatch = attrs.match(/\bsrc\s*=\s*(?:["'`]([^"'`]+)["'`]|\{["'`]([^"'`]+)["'`]\})/);
        if (!srcMatch) continue;
        const src = (srcMatch[1] ?? srcMatch[2]).split("?")[0].split("#")[0];

        const override: ImageOverrideOptions = {};

        const formatsMatch = attrs.match(/\bformats\s*=\s*\{([^}]*)\}/);
        if (formatsMatch) {
            const parsed = parseFormatsAttr(formatsMatch[1]);
            if (parsed !== undefined) override.formats = parsed;
        }

        const maxWidthMatch = attrs.match(/\bmaxWidth\s*=\s*\{([^}]*)\}/);
        if (maxWidthMatch) {
            const trimmed = maxWidthMatch[1].trim();
            const parsed = trimmed === "false" ? false : parseNumberAttr(trimmed);
            if (parsed !== undefined) override.maxWidth = parsed;
        }

        const widthMatch = attrs.match(/\bwidth\s*=\s*\{?(\d+)\}?/);
        if (widthMatch) {
            override.extraWidths = [Number(widthMatch[1])];
        }

        const qualityMatch = attrs.match(/\bquality\s*=\s*\{?(\d+)\}?/);
        if (qualityMatch) {
            override.quality = Number(qualityMatch[1]);
        }

        const blurMatch = attrs.match(/\bblur\s*=\s*\{([^}]*)\}/);
        if (blurMatch) {
            const parsed = parseBlurAttr(blurMatch[1]);
            if (parsed !== undefined) override.blur = parsed;
        }

        if (Object.keys(override).length > 0) {
            mergeOverrideInto(overrides, src, override);
        }
    }

    return overrides;
}

async function collectCodeFiles(
    root: string,
    publicDir: string,
    extensions: readonly string[] = CODE_EXTENSIONS,
): Promise<string[]> {
    let rootItems;
    try {
        rootItems = await readdir(root, { withFileTypes: true });
    } catch {
        return [];
    }
    const codeFiles: string[] = [];

    for (const item of rootItems) {
        if (IGNORED_DIRS.has(item.name)) continue;
        if (IGNORED_FILES.has(item.name)) continue;
        if (item.name === publicDir) continue;
        const full = path.join(root, item.name);
        if (item.isDirectory()) {
            await findCodeFiles(full, codeFiles, extensions);
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            codeFiles.push(full);
        }
    }
    return codeFiles;
}

function resolvePublicSrc(ref: string): string {
    const cleanRef = ref
        .split("?")[0]
        .split("#")[0]
        .replace(/^\$\{[^}]*\}/, "")
        .replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/]+/i, "");
    let relative = cleanRef;
    const publicIdx = relative.indexOf("public/");
    if (publicIdx !== -1) {
        relative = relative.slice(publicIdx + "public/".length);
    } else if (relative.startsWith("/")) {
        relative = relative.slice(1);
    }
    return `/${relative}`;
}

/**
 * Scans project source for <Image> tags with per-image optimizer props
 * (formats / blur / quality / maxWidth) and returns them keyed by public src,
 * in the same shape as the plugin's `overrides` config option.
 */
export async function collectUsedImageOverrides(
    root: string,
    publicDir = "public",
): Promise<Record<string, ImageOverrideOptions>> {
    const codeFiles = await collectCodeFiles(root, publicDir);
    const overrides: Record<string, ImageOverrideOptions> = {};

    for (const file of codeFiles) {
        const content = await readFile(file, "utf8").catch(() => "");
        const fileOverrides = extractImageOverrides(content);
        for (const [src, override] of Object.entries(fileOverrides)) {
            const publicSrc = resolvePublicSrc(src);
            mergeOverrideInto(overrides, publicSrc, override);
        }
    }

    return overrides;
}

export async function collectUsedImages(
    root: string,
    publicDir = "public",
): Promise<string[]> {
    const publicRoot = path.resolve(root, publicDir);
    const codeFiles = await collectCodeFiles(root, publicDir);

    const referenced = new Set<string>();
    for (const file of codeFiles) {
        const content = await readFile(file, "utf8").catch(() => "");
        const refs = extractImageReferences(content);
        for (const ref of refs) {
            referenced.add(ref);
        }
    }

    const resolvedFiles = new Set<string>();
    for (const ref of referenced) {
        const cleanRef = ref.split("?")[0].split("#")[0];

        let relativeInPublic = cleanRef;
        const publicIdx = relativeInPublic.indexOf("public/");
        if (publicIdx !== -1) {
            relativeInPublic = relativeInPublic.slice(publicIdx + "public/".length);
        } else if (relativeInPublic.startsWith("/")) {
            relativeInPublic = relativeInPublic.slice(1);
        }

        const candidate = path.resolve(publicRoot, relativeInPublic);
        if (candidate.startsWith(publicRoot)) {
            resolvedFiles.add(candidate);
        }
    }

    const existing: string[] = [];
    for (const file of resolvedFiles) {
        try {
            const fileStat = await stat(file);
            if (fileStat.isFile()) {
                existing.push(file);
            }
        } catch {
            // does not exist, ignore
        }
    }

    return existing.sort();
}

export interface ImageUsageDetails {
    imageComponentRefs: Set<string>;
    metadataRefs: Set<string>;
    otherRefs: Set<string>;
}

export interface ImageUsageClassification {
    canonicalSrc: string;
    inImageComponent: boolean;
    inMetadata: boolean;
    inOtherPlace: boolean;
}

const SCRIPT_COMMENT_EXTENSIONS: ReadonlySet<string> = new Set([
    ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".astro", ".vue", ".svelte", ".mdx", ".scss", ".sass", ".less",
]);
const BLOCK_COMMENT_EXTENSIONS: ReadonlySet<string> = new Set([...SCRIPT_COMMENT_EXTENSIONS, ".css"]);
const HTML_COMMENT_EXTENSIONS: ReadonlySet<string> = new Set([".html", ".vue", ".svelte", ".astro", ".svg", ".xml", ".md", ".mdx"]);

/**
 * Replaces comments with spaces (newlines kept, so offsets and line numbers stay
 * the same). An image named only in a comment is not a use of it.
 */
export function blankComments(code: string, filePath = ""): string {
    const ext = path.extname(filePath).toLowerCase();
    const lineComments = SCRIPT_COMMENT_EXTENSIONS.has(ext);
    const blockComments = BLOCK_COMMENT_EXTENSIONS.has(ext);
    const htmlComments = HTML_COMMENT_EXTENSIONS.has(ext);
    if (!lineComments && !blockComments && !htmlComments) return code;

    const out = code.split("");
    const blank = (from: number, to: number): void => {
        for (let k = from; k < to && k < out.length; k++) {
            if (out[k] !== "\n") out[k] = " ";
        }
    };
    let quote: string | null = null;
    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        if (quote) {
            if (char === "\\") i++;
            else if (char === quote || (char === "\n" && quote !== "`")) quote = null;
            continue;
        }
        if (htmlComments && code.startsWith("<!--", i)) {
            const end = code.indexOf("-->", i + 4);
            const stop = end === -1 ? code.length : end + 3;
            blank(i, stop);
            i = stop - 1;
            continue;
        }
        if (blockComments && char === "/" && code[i + 1] === "*") {
            const end = code.indexOf("*/", i + 2);
            const stop = end === -1 ? code.length : end + 2;
            blank(i, stop);
            i = stop - 1;
            continue;
        }
        if (lineComments && char === "/" && code[i + 1] === "/" && code[i - 1] !== ":") {
            const end = code.indexOf("\n", i);
            const stop = end === -1 ? code.length : end;
            blank(i, stop);
            i = stop - 1;
            continue;
        }
        if (lineComments && (char === "'" || char === '"' || char === "`")) quote = char;
    }
    return out.join("");
}

export function extractImageUsageDetails(rawCode: string, filePath?: string): ImageUsageDetails {
    const code = blankComments(rawCode, filePath);
    const imageComponentRefs = new Set<string>();
    const metadataRefs = new Set<string>();
    const otherRefs = new Set<string>();

    const ext = path.extname(filePath || "").toLowerCase();
    const isNonCodeAsset = ASSET_EXTENSIONS.includes(ext);

    // If it's a CSS, JSON, HTML or Markdown file, all image references are unoptimizable (other)
    if (isNonCodeAsset) {
        for (const ref of extractImageReferences(code)) {
            otherRefs.add(ref);
        }
        return { imageComponentRefs, metadataRefs, otherRefs };
    }

    // 0. Image imports are not special: `import logo from "./logo.png"` counts as an <Image>-only
    //    use below only when `logo` is used nowhere but in <Image src={logo}>.
    const importRanges: { start: number; end: number }[] = [];

    // 1. Identify <Image ...> ranges and references
    const imageRanges: { start: number; end: number }[] = [];
    const tagPattern = /<Image\b([^>]*)\/?>/gs;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagPattern.exec(code)) !== null) {
        imageRanges.push({ start: tagMatch.index, end: tagMatch.index + tagMatch[0].length });
        const attrs = tagMatch[1];

        // Literal src: src="..." or src={"..."}
        const literalMatch = attrs.match(/\bsrc\s*=\s*(?:["'`]([^"'`]+)["'`]|\{\s*["'`]([^"'`]+)["'`]\s*\})/);
        if (literalMatch) {
            const raw = literalMatch[1] ?? literalMatch[2];
            if (raw) imageComponentRefs.add(raw);
        } else {
            // Identifier: src={identifier}
            const identMatch = attrs.match(/\bsrc\s*=\s*\{\s*([a-zA-Z0-9_$]+)\s*\}/);
            if (identMatch) {
                const varName = identMatch[1];
                // Check if defined as `const|let|var varName = "..."`
                const declRegex = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`, "g");
                const declMatch = declRegex.exec(code);
                const importRegex = new RegExp(`import\\s+${varName}\\s+from\\s+["'\`]([^"'\`]+)["'\`]`, "g");
                const importMatch = importRegex.exec(code);
                const matchedSrc = declMatch?.[1] ?? importMatch?.[1];
                const matchedRange = declMatch
                    ? { start: declMatch.index, end: declMatch.index + declMatch[0].length }
                    : importMatch
                        ? { start: importMatch.index, end: importMatch.index + importMatch[0].length }
                        : null;

                if (matchedSrc && matchedRange) {
                    // Used only for <Image> when every other occurrence of the name sits in an
                    // <Image src={name}> and the name is not exported for use in other files.
                    const identRegex = new RegExp(`(?<![\\w$.])${escapeRegExp(varName)}(?![\\w$])`, "g");
                    const totalMatches = code.match(identRegex)!.length;
                    let inImageSrcCount = 0;
                    const srcRegex = new RegExp(`\\bsrc\\s*=\\s*\\{\\s*${escapeRegExp(varName)}\\s*\\}`, "g");
                    for (const m of code.matchAll(/<Image\b([^>]*)\/?>/gs)) {
                        inImageSrcCount += m[1].match(srcRegex)?.length ?? 0;
                    }
                    const exported = new RegExp(
                        `\\bexport\\s+(?:const|let|var)\\s+${escapeRegExp(varName)}\\b|\\bexport\\s*\\{[^}]*(?<![\\w$])${escapeRegExp(varName)}(?![\\w$])|\\bexport\\s+default\\s+${escapeRegExp(varName)}\\b`,
                    ).test(code);
                    if (!exported && totalMatches === inImageSrcCount + 1) {
                        imageComponentRefs.add(matchedSrc);
                        imageRanges.push(matchedRange);
                    }
                }
            }
        }
    }

    // 2. Identify metadata ranges and references
    const metadataRanges = getMetadataRanges(code);
    for (const range of metadataRanges) {
        const block = code.slice(range.start, range.end + 1);
        const refPattern = /(?:["'`])([^"'`\s\n\r#?]+\.(?:png|jpg|jpeg|webp|avif))(?:\?[^"'`\s]*|#[^"'`\s]*)?(?:["'`])/gi;
        let refMatch: RegExpExecArray | null;
        while ((refMatch = refPattern.exec(block)) !== null) {
            if (isAppleIconAt(block, refMatch.index)) {
                otherRefs.add(refMatch[1]);
            } else {
                metadataRefs.add(refMatch[1]);
            }
        }
    }

    // 3. Scan all image string occurrences in code to find any in other places
    const pattern = /(?:["'`])([^"'`\s\n\r#?]+\.(?:png|jpg|jpeg|webp|avif))(?:\?[^"'`\s]*|#[^"'`\s]*)?(?:["'`])/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
        const raw = match[1];
        const offset = match.index;

        const inImp = importRanges.some((r) => offset >= r.start && offset < r.end);
        const inImage = inImp || imageRanges.some((r) => offset >= r.start && offset < r.end);
        const inMeta = metadataRanges.some((r) => offset >= r.start && offset < r.end);

        if (!inImage && !inMeta) {
            otherRefs.add(raw);
        }
    }

    return { imageComponentRefs, metadataRefs, otherRefs };
}

export async function classifyImageUsages(
    root: string,
    publicDir = "public",
): Promise<Record<string, ImageUsageClassification>> {
    const codeFiles = await collectCodeFiles(root, publicDir, SCANNED_EXTENSIONS);
    const classifications: Record<string, ImageUsageClassification> = {};

    function getOrCreate(canonicalSrc: string): ImageUsageClassification {
        if (!classifications[canonicalSrc]) {
            classifications[canonicalSrc] = {
                canonicalSrc,
                inImageComponent: false,
                inMetadata: false,
                inOtherPlace: false,
            };
        }
        return classifications[canonicalSrc];
    }

    for (const file of codeFiles) {
        const content = await readFile(file, "utf8").catch(() => "");
        const details = extractImageUsageDetails(content, file);

        for (const ref of details.imageComponentRefs) {
            const canonical = resolvePublicSrc(ref);
            getOrCreate(canonical).inImageComponent = true;
        }

        for (const ref of details.metadataRefs) {
            const canonical = resolvePublicSrc(ref);
            getOrCreate(canonical).inMetadata = true;
        }

        for (const ref of details.otherRefs) {
            const canonical = resolvePublicSrc(ref);
            getOrCreate(canonical).inOtherPlace = true;
        }
    }

    return classifications;
}

export function getPrunableOriginalPaths(
    classifications: Record<string, ImageUsageClassification>,
    manifestImages: Record<string, { src: string }>,
    optimizeMetadata: boolean,
): string[] {
    const prunable: string[] = [];

    for (const [canonicalSrc, usage] of Object.entries(classifications)) {
        if (!manifestImages[canonicalSrc]) continue;
        if (usage.inOtherPlace) continue;

        const canPrune = optimizeMetadata
            ? (usage.inImageComponent || usage.inMetadata)
            : (usage.inImageComponent && !usage.inMetadata);

        if (canPrune) {
            prunable.push(canonicalSrc.replace(/^\/+/, ""));
        }
    }

    return prunable.sort();
}

export const UNUSED_CANDIDATE_EXTENSIONS: readonly string[] = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".avif",
    ".gif",
    ".svg",
];

const PUBLIC_TEXT_EXTENSIONS: readonly string[] = [
    ...SCANNED_EXTENSIONS,
    ".webmanifest",
    ".xml",
    ".svg",
    ".txt",
];

async function walkFiles(dir: string, extensions: readonly string[], found: string[]): Promise<void> {
    let items;
    try {
        items = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (IGNORED_DIRS.has(item.name)) continue;
            await walkFiles(full, extensions, found);
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            found.push(full);
        }
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNameMentioned(text: string, name: string): boolean {
    return new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`).test(text);
}

function isDirBuiltDynamically(text: string, dirRel: string): boolean {
    const dir = escapeRegExp(dirRel);
    const dynamicTail = "(?:\\$\\{|[\"'`])";
    return new RegExp(`(?<=/)${dir}/?${dynamicTail}|["'\`]${dir}/${dynamicTail}`).test(text);
}

/**
 * Lists images inside `dirs` that nothing in the project references, as paths
 * relative to `publicDir` (no leading slash). Comments and Markdown docs outside
 * `publicDir` do not count as references. Conservative otherwise: an image
 * counts as used when any scanned file mentions its file name or its file name
 * without extension, or builds a path dynamically from its directory or any
 * parent directory under `publicDir`.
 */
export async function collectUnusedImages(
    root: string,
    dirs: readonly string[],
    publicDir = "public",
): Promise<string[]> {
    const publicRoot = path.resolve(root, publicDir);
    const candidates: string[] = [];
    for (const dir of dirs) {
        const abs = path.resolve(root, dir);
        if (abs !== publicRoot && !abs.startsWith(publicRoot + path.sep)) continue;
        await walkFiles(abs, UNUSED_CANDIDATE_EXTENSIONS, candidates);
    }
    if (candidates.length === 0) return [];

    const textFiles = await collectCodeFiles(root, publicDir, SCANNED_EXTENSIONS);
    const publicTextFiles: string[] = [];
    await walkFiles(publicRoot, PUBLIC_TEXT_EXTENSIONS, publicTextFiles);
    const contents = await Promise.all(
        [...textFiles.filter((file) => path.extname(file).toLowerCase() !== ".md"), ...publicTextFiles]
            .filter((file) => !IGNORED_FILES.has(path.basename(file)))
            .map(async (file) => blankComments(await readFile(file, "utf8").catch(() => ""), file)),
    );
    const text = contents.join("\n");

    const dynamicDirs = new Map<string, boolean>();
    const unused: string[] = [];
    const uniqueCandidates = [...new Set(candidates)].sort();
    for (const file of uniqueCandidates) {
        const rel = path.relative(publicRoot, file).split(path.sep).join("/");
        const base = path.basename(rel);
        const stem = base.slice(0, base.length - path.extname(base).length);
        if (text.includes(base) || isNameMentioned(text, stem)) continue;

        const parts = rel.split("/").slice(0, -1);
        let dynamic = false;
        for (let i = parts.length; i > 0 && !dynamic; i--) {
            const dirRel = parts.slice(0, i).join("/");
            if (!dynamicDirs.has(dirRel)) dynamicDirs.set(dirRel, isDirBuiltDynamically(text, dirRel));
            dynamic = dynamicDirs.get(dirRel)!;
        }
        if (dynamic) continue;

        unused.push(rel);
    }
    // Nothing referenced at all means the scan could not see how images are used: prune nothing.
    return unused.length === uniqueCandidates.length ? [] : unused;
}
