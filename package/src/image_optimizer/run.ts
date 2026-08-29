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
    cacheFile: string,
): Promise<OptimizedImage[]> {
    const publicRoot = path.join(root, "public");
    const files = await collectImages(options.dirs, root);
    const cache = await loadCache(cacheFile);
    const next: CacheData = {};
    const entries: OptimizedImage[] = [];

    for (const file of files) {
        const key = path.relative(root, file);
        const cached = cache[key];
        const targets = targetAndSiblingPaths(file, publicRoot, options, root);
        if (await isFresh(file, cached, targets)) {
            next[key] = cached;
            entries.push(cached.result);
            continue;
        }
        const result = await processImage(file, publicRoot, options, root);
        const stats = await stat(file);
        next[key] = { mtimeMs: stats.mtimeMs, size: stats.size, result };
        entries.push(result);
    }

    await saveCache(cacheFile, next);
    await writeManifest(path.resolve(root, options.manifest), entries);
    return entries;
}
