import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
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

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
    "node_modules",
    ".git",
    ".next",
    ".vinext",
    "dist",
    "build",
    "coverage",
    ".cache",
    ".skeleton-diff",
    "generated",
]);

export async function findCodeFiles(dir: string, found: string[] = []): Promise<string[]> {
    let items;
    try {
        items = await readdir(dir, { withFileTypes: true });
    } catch {
        return found;
    }
    for (const item of items) {
        if (IGNORED_DIRS.has(item.name)) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            await findCodeFiles(full, found);
        } else if (CODE_EXTENSIONS.includes(path.extname(item.name).toLowerCase())) {
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

async function collectCodeFiles(root: string, publicDir: string): Promise<string[]> {
    let rootItems;
    try {
        rootItems = await readdir(root, { withFileTypes: true });
    } catch {
        return [];
    }
    const codeFiles: string[] = [];

    for (const item of rootItems) {
        if (IGNORED_DIRS.has(item.name)) continue;
        if (item.name === publicDir) continue;
        const full = path.join(root, item.name);
        if (item.isDirectory()) {
            await findCodeFiles(full, codeFiles);
        } else if (CODE_EXTENSIONS.includes(path.extname(item.name).toLowerCase())) {
            codeFiles.push(full);
        }
    }
    return codeFiles;
}

function resolvePublicSrc(ref: string): string {
    const cleanRef = ref.split("?")[0].split("#")[0];
    let relative = cleanRef;
    if (relative.startsWith("/")) relative = relative.slice(1);
    if (relative.startsWith("public/")) relative = relative.slice("public/".length);
    return `/${relative}`;
}

/**
 * Scans project source for <Image> tags with per-image optimizer props
 * (formats / blur / quality / maxWidth) and returns them keyed by public src,
 * in the same shape as the plugin's `overrides` config option.
 */
export async function collectUsedImageOverrides(
    root: string,
    publicDir: string = "public",
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
    publicDir: string = "public",
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
        if (relativeInPublic.startsWith("/")) relativeInPublic = relativeInPublic.slice(1);
        if (relativeInPublic.startsWith("public/")) relativeInPublic = relativeInPublic.slice("public/".length);

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
