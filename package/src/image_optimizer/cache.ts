import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OptimizedImage } from "./types.js";

export interface CacheEntry {
    mtimeMs: number;
    size: number;
    result: OptimizedImage;
}

export type CacheData = Record<string, CacheEntry>;

export async function isFresh(
    sourcePath: string,
    cached: CacheEntry | undefined,
    targets: string[],
): Promise<boolean> {
    if (!cached) return false;
    try {
        const stats = await stat(sourcePath);
        if (stats.mtimeMs !== cached.mtimeMs || stats.size !== cached.size) {
            return false;
        }
    } catch {
        return false;
    }
    for (const target of targets) {
        if (!existsSync(target)) return false;
    }
    return true;
}

export async function loadCache(cacheFile: string): Promise<CacheData> {
    try {
        const content = await readFile(cacheFile, "utf8");
        return JSON.parse(content) as CacheData;
    } catch {
        return {};
    }
}

export async function saveCache(cacheFile: string, data: CacheData): Promise<void> {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(data, null, 2), "utf8");
}
