import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isFresh, loadCache, saveCache } from "./cache.js";
import type { CacheData } from "./cache.js";
import { writeManifest } from "./manifest.js";
import { EXTENSION_BY_FORMAT, processImage, toGeneratedPath, toPublicSrc, withWidthSuffix } from "./process_image.js";
import { collectUsedImageOverrides, collectUsedImages } from "./scan_used.js";
import { resolveImageConfig, SUPPORTED_EXTENSIONS } from "./types.js";
import type { ImageFormat, ImageOverrideOptions, OptimizedImage, ResolvedOptions } from "./types.js";
import type { CacheEntry } from "./cache.js";

export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    const width = Math.max(1, Math.min(limit, items.length));
    let next = 0;

    async function pump(): Promise<void> {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: width }, () => pump()));
    return results;
}

async function walk(directory: string, found: string[]): Promise<void> {
    let items;
    try {
        items = await readdir(directory, { withFileTypes: true });
    } catch {
        return;
    }
    for (const item of items) {
        const full = path.join(directory, item.name);
        if (item.isDirectory()) {
            await walk(full, found);
            continue;
        }
        if (SUPPORTED_EXTENSIONS.includes(path.extname(item.name).toLowerCase())) {
            found.push(full);
        }
    }
}

export async function collectImages(dirs: string[], root: string): Promise<string[]> {
    const found: string[] = [];
    for (const dir of dirs) {
        await walk(path.resolve(root, dir), found);
    }
    return found.sort();
}

function variantTargetPaths(
    targetFile: string,
    config: { formats: ImageFormat[]; blur: { enabled: boolean } },
    width: number,
    isDefault: boolean,
): string[] {
    const primaryFormat: ImageFormat | "original" = config.formats.length > 0
        ? config.formats[0]
        : "original";

    const primaryExt = primaryFormat === "original" ? undefined : EXTENSION_BY_FORMAT[primaryFormat];
    const primaryFile = withWidthSuffix(
        primaryExt ? targetFile.replace(/\.[^.]+$/, `.${primaryExt}`) : targetFile,
        width,
        isDefault,
    );

    const result = [primaryFile];

    for (let i = 1; i < config.formats.length; i++) {
        const ext = EXTENSION_BY_FORMAT[config.formats[i]];
        result.push(withWidthSuffix(targetFile.replace(/\.[^.]+$/, `.${ext}`), width, isDefault));
    }

    if (config.blur.enabled) {
        result.push(primaryFile.replace(/\.[^.]+$/, ".blur.webp"));
    }
    return result;
}

export async function targetAndSiblingPaths(
    absolutePath: string,
    publicRoot: string,
    options: ResolvedOptions,
    root: string,
): Promise<string[]> {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const { targetFile } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);

    const metadata = await sharp(absolutePath).metadata();
    const sourceWidth = metadata.width as number;

    const defaultWidth = config.maxWidth !== false && config.maxWidth < sourceWidth
        ? config.maxWidth
        : sourceWidth;

    const result = variantTargetPaths(targetFile, config, defaultWidth, true);

    const extraWidths = Array.from(new Set(config.extraWidths))
        .map((w) => (w < sourceWidth ? w : sourceWidth))
        .filter((w) => w !== defaultWidth);

    for (const width of extraWidths) {
        result.push(...variantTargetPaths(targetFile, config, width, false));
    }

    return result;
}

/**
 * Merges optimizer overrides scanned from <Image> JSX props with the plugin's
 * centralized `overrides` config, so settings can live at the usage site. An
 * explicit config override for a given src still wins over a scanned one.
 */
export function mergeOverrides(
    scanned: Record<string, ImageOverrideOptions>,
    configured: Record<string, ImageOverrideOptions>,
): Record<string, ImageOverrideOptions> {
    const merged: Record<string, ImageOverrideOptions> = { ...scanned };
    for (const [src, override] of Object.entries(configured)) {
        const existing = merged[src];
        const mergedWidths = existing?.extraWidths || override.extraWidths
            ? Array.from(new Set([...(existing?.extraWidths ?? []), ...(override.extraWidths ?? [])]))
            : undefined;
        merged[src] = { ...existing, ...override };
        if (mergedWidths) {
            merged[src].extraWidths = mergedWidths;
        }
    }
    return merged;
}

export async function run(
    root: string,
    options: ResolvedOptions,
    cacheFile: string = path.resolve(root, options.cacheDir, "manifest.json"),
): Promise<OptimizedImage[]> {
    const publicRoot = path.resolve(root, "public");
    const manifestPath = path.resolve(root, options.manifest);
    const cache = await loadCache(cacheFile);
    const nextCache: CacheData = {};

    let files: string[] = [];
    if (options.onlyUsed) {
        files = await collectUsedImages(root, "public");
        if (files.length === 0) {
            files = await collectImages(options.dirs, root);
        }
    } else {
        files = await collectImages(options.dirs, root);
    }

    const scannedOverrides = await collectUsedImageOverrides(root, "public");
    const resolvedOptions: ResolvedOptions = {
        ...options,
        overrides: mergeOverrides(scannedOverrides, options.overrides),
    };

    const processed = await mapWithConcurrency(files, options.concurrency, async (file) => {
        const relativeKey = path.relative(root, file);
        const cached = cache[relativeKey];
        const targets = await targetAndSiblingPaths(file, publicRoot, resolvedOptions, root);
        const fresh = await isFresh(file, cached, targets);

        if (fresh && cached) {
            return { relativeKey, entry: cached };
        }

        const result = await processImage(file, publicRoot, resolvedOptions, root);
        const fileStat = await stat(file);
        return {
            relativeKey,
            entry: { mtimeMs: fileStat.mtimeMs, size: fileStat.size, result } as CacheEntry,
        };
    });

    const entries: OptimizedImage[] = [];
    for (const { relativeKey, entry } of processed) {
        entries.push(entry.result);
        nextCache[relativeKey] = entry;
    }

    await saveCache(cacheFile, nextCache);
    await writeManifest(manifestPath, entries);
    return entries;
}
