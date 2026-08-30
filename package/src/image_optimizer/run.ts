import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isFresh, loadCache, saveCache } from "./cache.js";
import type { CacheData } from "./cache.js";
import { writeManifest } from "./manifest.js";
import { processImage, toGeneratedPath, toPublicSrc } from "./process_image.js";
import { collectUsedImageOverrides, collectUsedImages } from "./scan_used.js";
import { resolveImageConfig, SUPPORTED_EXTENSIONS } from "./types.js";
import type { ImageFormat, ImageOverrideOptions, OptimizedImage, ResolvedOptions } from "./types.js";

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

export function targetAndSiblingPaths(
    absolutePath: string,
    publicRoot: string,
    options: ResolvedOptions,
    root: string,
): string[] {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const { targetFile } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);

    const primaryFormat: ImageFormat | "original" = config.formats.length > 0
        ? config.formats[0]
        : "original";

    const primaryFile = primaryFormat === "original"
        ? targetFile
        : targetFile.replace(/\.[^.]+$/, `.${primaryFormat}`);

    const result = [primaryFile];

    for (let i = 1; i < config.formats.length; i++) {
        const format = config.formats[i];
        result.push(targetFile.replace(/\.[^.]+$/, `.${format}`));
    }

    if (config.blur.enabled) {
        result.push(primaryFile.replace(/\.[^.]+$/, ".blur.webp"));
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
        merged[src] = { ...merged[src], ...override };
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

    const entries: OptimizedImage[] = [];

    for (const file of files) {
        const relativeKey = path.relative(root, file);
        const cached = cache[relativeKey];
        const targets = targetAndSiblingPaths(file, publicRoot, resolvedOptions, root);
        const fresh = await isFresh(file, cached, targets);

        if (fresh && cached) {
            entries.push(cached.result);
            nextCache[relativeKey] = cached;
            continue;
        }

        const result = await processImage(file, publicRoot, resolvedOptions, root);
        const fileStat = await stat(file);
        entries.push(result);
        nextCache[relativeKey] = {
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
            result,
        };
    }

    await saveCache(cacheFile, nextCache);
    await writeManifest(manifestPath, entries);
    return entries;
}
