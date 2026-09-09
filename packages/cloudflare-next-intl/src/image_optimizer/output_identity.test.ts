import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { cleanup, hashDir, makeTempDir, writeFixtureJpg, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";
import { run } from "./run.js";
import { resolveOptions } from "./types.js";

const roots: string[] = [];

afterAll(async () => {
    for (const dir of roots) await cleanup(dir);
});

async function buildFixtureRoot(): Promise<string> {
    const root = await makeTempDir();
    roots.push(root);
    const imagesDir = path.join(root, "public", "images");
    await mkdir(imagesDir, { recursive: true });
    await writeFixturePng(imagesDir, "flat.png", 640, 480);
    await writeFixtureJpg(imagesDir, "photo.jpg", 1200, 900);
    await writeFixturePng(imagesDir, "tall.png", 300, 900);
    return root;
}

function fixtureOptions() {
    return resolveOptions({
        dirs: ["public/images"],
        onlyUsed: false,
        formats: ["avif", "webp"],
        outDir: "public/generated",
        manifest: "public/generated/images.json",
        overrides: { "/images/photo.jpg": { extraWidths: [400, 800] } },
    });
}

describe("generated output is byte-stable", () => {
    it("produces identical bytes for identical inputs across runs", async () => {
        const first = await buildFixtureRoot();
        const second = await buildFixtureRoot();

        await run(first, fixtureOptions(), path.join(first, ".cache", "manifest.json"));
        await run(second, fixtureOptions(), path.join(second, ".cache", "manifest.json"));

        const a = await hashDir(path.join(first, "public", "generated"));
        const b = await hashDir(path.join(second, "public", "generated"));

        expect(Object.keys(a).length).toBeGreaterThan(0);
        expect(b).toEqual(a);
    });

    it("matches the recorded output snapshot", async () => {
        // avif bytes vary by CPU arch (aom SIMD path), so they're excluded here;
        // cross-run determinism is still covered by the test above.
        const root = await buildFixtureRoot();
        await run(root, fixtureOptions(), path.join(root, ".cache", "manifest.json"));
        const hashes = await hashDir(path.join(root, "public", "generated"), /\.avif$/);
        expect(hashes).toMatchSnapshot();
    });
});
