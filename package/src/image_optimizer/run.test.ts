import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OPTIONS, resolveOptions } from "./types.js";
import { collectImages, run } from "./run.js";
import { cleanup, makeTempDir, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

async function makeProject(): Promise<string> {
    const root = await makeTempDir();
    await mkdir(path.join(root, "public", "images", "nested"), { recursive: true });
    await mkdir(path.join(root, "public", "icons"), { recursive: true });
    return root;
}

describe("run", () => {
    it("collectImages finds rasters recursively and skips svg, ico and missing dirs", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "a.png", 40, 40);
        await writeFixturePng(path.join(root, "public", "images", "nested"), "nested.png", 40, 40);
        await writeFile(path.join(root, "public", "images", "b.svg"), "<svg/>");
        await writeFile(path.join(root, "public", "icons", "c.ico"), "x");

        const found = await collectImages(
            ["public/images", "public/icons", "public/missing"],
            root,
        );

        expect(found).toEqual([
            path.join(root, "public", "images", "a.png"),
            path.join(root, "public", "images", "nested", "nested.png"),
        ]);
        await cleanup(root);
    });

    it("collectImages skips non-directory files passed in dirs", async () => {
        const root = await makeProject();
        const file = await writeFixturePng(root, "file.png", 10, 10);

        const found = await collectImages([path.relative(root, file)], root);
        expect(found).toEqual([]);
        await cleanup(root);
    });

    it("run writes a manifest and emits optimized images in public/generated", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "a.png", 40, 40);
        const manifest = path.join(root, "public", "generated", "images.json");
        const cacheFile = path.join(root, ".cache", "manifest.json");

        const entries = await run(
            root,
            resolveOptions({ manifest: "public/generated/images.json" }),
            cacheFile,
        );

        expect(entries.length).toBe(1);
        expect(entries[0].originalSrc).toBe("/images/a.png");
        expect(entries[0].src).toBe("/generated/images/a.png");

        const genFile = path.join(root, "public", "generated", "images", "a.png");
        expect(existsSync(genFile)).toBe(true);
        expect(existsSync(path.join(root, "public", "generated", "images", "a.avif"))).toBe(true);
        expect(existsSync(path.join(root, "public", "generated", "images", "a.webp"))).toBe(true);
        expect(existsSync(path.join(root, "public", "generated", "images", "a.blur.webp"))).toBe(true);

        const source = await readFile(manifest, "utf8");
        const parsed = JSON.parse(source);
        expect(parsed.images["/images/a.png"]).toBeDefined();
        expect(parsed.images["/images/a.png"].src).toBe("/generated/images/a.png");
        await cleanup(root);
    });

    it("a second run is a no-op and leaves the original byte-identical", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "a.png", 40, 40);
        const file = path.join(root, "public", "images", "a.png");
        const cacheFile = path.join(root, ".cache", "manifest.json");

        await run(root, DEFAULT_OPTIONS, cacheFile);
        const first = await readFile(file);
        const firstStat = await stat(file);

        await run(root, DEFAULT_OPTIONS, cacheFile);
        const second = await readFile(file);
        const secondStat = await stat(file);

        expect(first.equals(second)).toBe(true);
        expect(firstStat.mtimeMs).toBe(secondStat.mtimeMs);
        await cleanup(root);
    });

    it("changing a source file causes reprocessing in outDir", async () => {
        const root = await makeProject();
        const dir = path.join(root, "public", "images");
        await writeFixturePng(dir, "a.png", 40, 40);
        const cacheFile = path.join(root, ".cache", "manifest.json");

        await run(root, DEFAULT_OPTIONS, cacheFile);
        await writeFixturePng(dir, "a.png", 80, 60);
        const entries = await run(root, DEFAULT_OPTIONS, cacheFile);

        expect(entries[0].width).toBe(80);
        expect(entries[0].height).toBe(60);
        await cleanup(root);
    });
});
