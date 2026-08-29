import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isFresh, loadCache, saveCache } from "./cache.js";
import type { CacheData } from "./cache.js";
import { writeManifest } from "./manifest.js";
import { processImage, toGeneratedPath, toPublicSrc } from "./process_image.js";
import { resolveImageConfig, SUPPORTED_EXTENSIONS } from "./types.js";
import type { OptimizedImage, ResolvedOptions } from "./types.js";

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

function targetAndSiblingPaths(
    absolutePath: string,
    publicRoot: string,
    options: ResolvedOptions,
    root: string,
): string[] {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const { targetFile } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);
    const siblings = config.formats.map((format) =>
        targetFile.replace(/\.[^.]+$/, `.${format}`)
    );
    const result = [targetFile, ...siblings];
    if (config.blur.enabled) {
        result.push(targetFile.replace(/\.[^.]+$/, ".blur.webp"));
    }
    return result;
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
    const files = await collectImages(options.dirs, root);
    const entries: OptimizedImage[] = [];

    for (const file of files) {
        const relativeKey = path.relative(root, file);
        const cached = cache[relativeKey];
        const targets = targetAndSiblingPaths(file, publicRoot, options, root);
        const fresh = await isFresh(file, cached, targets);

        if (fresh && cached) {
            entries.push(cached.result);
            nextCache[relativeKey] = cached;
            continue;
        }

        const result = await processImage(file, publicRoot, options, root);
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
