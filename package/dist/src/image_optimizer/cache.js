import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
export async function isFresh(sourcePath, cached, targets) {
    if (!cached)
        return false;
    try {
        const stats = await stat(sourcePath);
        if (stats.mtimeMs !== cached.mtimeMs || stats.size !== cached.size) {
            return false;
        }
    }
    catch {
        return false;
    }
    for (const target of targets) {
        if (!existsSync(target))
            return false;
    }
    return true;
}
export async function loadCache(cacheFile) {
    try {
        const content = await readFile(cacheFile, "utf8");
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
export async function saveCache(cacheFile, data) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(data, null, 2), "utf8");
}
