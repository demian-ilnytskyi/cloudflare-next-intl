import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ManifestData, OptimizedImage } from "./types.js";

export function renderManifest(entries: OptimizedImage[]): string {
    const images: Record<string, OptimizedImage> = {};
    const sorted = [...entries].sort((a, b) =>
        a.originalSrc.localeCompare(b.originalSrc)
    );
    for (const entry of sorted) {
        images[entry.originalSrc] = entry;
    }
    const manifest: ManifestData = { images };
    return JSON.stringify(manifest, null, 2);
}

export async function writeManifest(
    manifestPath: string,
    entries: OptimizedImage[],
): Promise<void> {
    const rendered = renderManifest(entries);
    let current = "";
    try {
        current = await readFile(manifestPath, "utf8");
    } catch {
        // file does not exist yet
    }
    if (current === rendered) return;
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, rendered, "utf8");
}
