import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isFresh, loadCache, saveCache } from "./cache.js";
import { writeManifest } from "./manifest.js";
import { processImage, toGeneratedPath, toPublicSrc } from "./process_image.js";
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
function targetAndSiblingPaths(absolutePath, publicRoot, options, root) {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const { targetFile } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);
    const siblings = config.formats.map((format) => targetFile.replace(/\.[^.]+$/, `.${format}`));
    const result = [targetFile, ...siblings];
    if (config.blur.enabled) {
        result.push(targetFile.replace(/\.[^.]+$/, ".blur.webp"));
    }
    return result;
}
export async function run(root, options, cacheFile = path.resolve(root, options.cacheDir, "manifest.json")) {
    const publicRoot = path.resolve(root, "public");
    const manifestPath = path.resolve(root, options.manifest);
    const cache = await loadCache(cacheFile);
    const nextCache = {};
    const files = await collectImages(options.dirs, root);
    const entries = [];
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
