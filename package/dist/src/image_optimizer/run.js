import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isFresh, loadCache, saveCache } from "./cache.js";
import { writeManifest } from "./manifest.js";
import { EXTENSION_BY_FORMAT, processImage, toGeneratedPath, toPublicSrc, withWidthSuffix } from "./process_image.js";
import { collectUsedImageOverrides, collectUsedImages } from "./scan_used.js";
import { resolveImageConfig, SUPPORTED_EXTENSIONS } from "./types.js";
async function walk(directory, found) {
    let items;
    try {
        items = await readdir(directory, { withFileTypes: true });
    }
    catch {
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
export async function collectImages(dirs, root) {
    const found = [];
    for (const dir of dirs) {
        await walk(path.resolve(root, dir), found);
    }
    return found.sort();
}
function variantTargetPaths(targetFile, config, width, isDefault) {
    const primaryFormat = config.formats.length > 0
        ? config.formats[0]
        : "original";
    const primaryExt = primaryFormat === "original" ? undefined : EXTENSION_BY_FORMAT[primaryFormat];
    const primaryFile = withWidthSuffix(primaryExt ? targetFile.replace(/\.[^.]+$/, `.${primaryExt}`) : targetFile, width, isDefault);
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
export async function targetAndSiblingPaths(absolutePath, publicRoot, options, root) {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const { targetFile } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);
    const metadata = await sharp(absolutePath).metadata();
    const sourceWidth = metadata.width;
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
export function mergeOverrides(scanned, configured) {
    const merged = { ...scanned };
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
export async function run(root, options, cacheFile = path.resolve(root, options.cacheDir, "manifest.json")) {
    const publicRoot = path.resolve(root, "public");
    const manifestPath = path.resolve(root, options.manifest);
    const cache = await loadCache(cacheFile);
    const nextCache = {};
    let files = [];
    if (options.onlyUsed) {
        files = await collectUsedImages(root, "public");
        if (files.length === 0) {
            files = await collectImages(options.dirs, root);
        }
    }
    else {
        files = await collectImages(options.dirs, root);
    }
    const scannedOverrides = await collectUsedImageOverrides(root, "public");
    const resolvedOptions = {
        ...options,
        overrides: mergeOverrides(scannedOverrides, options.overrides),
    };
    const entries = [];
    for (const file of files) {
        const relativeKey = path.relative(root, file);
        const cached = cache[relativeKey];
        const targets = await targetAndSiblingPaths(file, publicRoot, resolvedOptions, root);
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
