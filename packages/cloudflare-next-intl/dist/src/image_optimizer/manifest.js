import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export function renderManifest(entries) {
    const images = {};
    const sorted = [...entries].sort((a, b) => a.originalSrc.localeCompare(b.originalSrc));
    for (const entry of sorted) {
        images[entry.originalSrc] = entry;
    }
    const manifest = { images };
    return JSON.stringify(manifest, null, 2);
}
export async function writeManifest(manifestPath, entries) {
    const rendered = renderManifest(entries);
    let current = "";
    try {
        current = await readFile(manifestPath, "utf8");
    }
    catch {
    }
    if (current === rendered)
        return;
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, rendered, "utf8");
}
