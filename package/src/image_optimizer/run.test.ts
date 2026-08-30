import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OPTIONS, resolveOptions } from "./types.js";
import { collectImages, mergeOverrides, run, targetAndSiblingPaths } from "./run.js";
import { cleanup, makeTempDir, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

async function makeProject(): Promise<string> {
    const root = await makeTempDir();
    await mkdir(path.join(root, "public", "images", "nested"), { recursive: true });
    await mkdir(path.join(root, "public", "icons"), { recursive: true });
    return root;
}

describe("run", () => {
    it("mergeOverrides lets a configured override win over a scanned one for the same src", () => {
        const scanned = {
            "/images/hero.png": { formats: ["avif"] as const, quality: 60 },
            "/images/only-scanned.png": { blur: false as const },
        };
        const configured = {
            "/images/hero.png": { quality: 90 },
        };

        const merged = mergeOverrides(scanned, configured);

        expect(merged["/images/hero.png"]).toEqual({ formats: ["avif"], quality: 90 });
        expect(merged["/images/only-scanned.png"]).toEqual({ blur: false });
    });

    it("targetAndSiblingPaths returns primary path, siblings, and blur when enabled", () => {
        const root = path.join("/tmp", "project");
        const publicRoot = path.join(root, "public");
        const file = path.join(publicRoot, "images", "hero.png");

        const optionsMultiple = resolveOptions({
            formats: ["webp", "avif"],
            blur: true,
        });
        const targetsMultiple = targetAndSiblingPaths(file, publicRoot, optionsMultiple, root);
        expect(targetsMultiple).toEqual([
            path.join(root, "public", "generated", "images", "hero.webp"),
            path.join(root, "public", "generated", "images", "hero.avif"),
            path.join(root, "public", "generated", "images", "hero.blur.webp"),
        ]);

        const optionsOriginal = resolveOptions({
            formats: false,
            blur: false,
        });
        const targetsOriginal = targetAndSiblingPaths(file, publicRoot, optionsOriginal, root);
        expect(targetsOriginal).toEqual([
            path.join(root, "public", "generated", "images", "hero.png"),
        ]);
    });

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

    it("run writes a manifest and emits optimized images using default cacheFile", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "a.png", 40, 40);
        const manifest = path.join(root, "public", "generated", "images.json");

        const entries = await run(
            root,
            resolveOptions({ manifest: "public/generated/images.json", onlyUsed: false }),
        );

        expect(entries.length).toBe(1);
        expect(entries[0].originalSrc).toBe("/images/a.png");
        expect(entries[0].src).toBe("/generated/images/a.webp");

        const genFile = path.join(root, "public", "generated", "images", "a.webp");
        expect(existsSync(genFile)).toBe(true);
        expect(existsSync(path.join(root, "public", "generated", "images", "a.blur.webp"))).toBe(true);

        const source = await readFile(manifest, "utf8");
        const parsed = JSON.parse(source);
        expect(parsed.images["/images/a.png"]).toBeDefined();
        expect(parsed.images["/images/a.png"].src).toBe("/generated/images/a.webp");
        await cleanup(root);
    });

    it("run scans only referenced code images when onlyUsed is true", async () => {
        const root = await makeProject();
        await mkdir(path.join(root, "src"), { recursive: true });
        const usedPng = await writeFixturePng(path.join(root, "public", "images"), "used.png", 40, 40);
        const unusedPng = await writeFixturePng(path.join(root, "public", "images"), "unused.png", 40, 40);

        await writeFile(
            path.join(root, "src", "App.tsx"),
            `<Image src="/images/used.png" alt="used" />`,
        );

        const entries = await run(
            root,
            resolveOptions({ manifest: "public/generated/images.json", onlyUsed: true }),
        );

        expect(entries.length).toBe(1);
        expect(entries[0].originalSrc).toBe("/images/used.png");
        expect(entries[0].src).toBe("/generated/images/used.webp");
        expect(existsSync(path.join(root, "public", "generated", "images", "unused.webp"))).toBe(false);

        await cleanup(root);
    });

    it("run applies per-image formats scanned from <Image> JSX props, config overrides taking precedence", async () => {
        const root = await makeProject();
        await mkdir(path.join(root, "src"), { recursive: true });
        await writeFixturePng(path.join(root, "public", "images"), "scanned.png", 40, 40);
        await writeFixturePng(path.join(root, "public", "images"), "both.png", 40, 40);

        await writeFile(
            path.join(root, "src", "App.tsx"),
            `
            <Image src="/images/scanned.png" formats={["gif"]} />
            <Image src="/images/both.png" formats={["gif"]} />
            `,
        );

        const entries = await run(
            root,
            resolveOptions({
                manifest: "public/generated/images.json",
                onlyUsed: true,
                overrides: {
                    "/images/both.png": { formats: ["avif"] },
                },
            }),
        );

        const scanned = entries.find((e) => e.originalSrc === "/images/scanned.png");
        const both = entries.find((e) => e.originalSrc === "/images/both.png");

        expect(scanned?.src).toBe("/generated/images/scanned.gif");
        expect(both?.src).toBe("/generated/images/both.avif");

        await cleanup(root);
    });

    it("run falls back to collectImages when onlyUsed is true but no images found in code", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "fallback.png", 40, 40);

        const entries = await run(
            root,
            resolveOptions({ manifest: "public/generated/images.json", onlyUsed: true }),
        );

        expect(entries.length).toBe(1);
        expect(entries[0].originalSrc).toBe("/images/fallback.png");
        await cleanup(root);
    });

    it("a second run is a no-op and leaves the original byte-identical", async () => {
        const root = await makeProject();
        await writeFixturePng(path.join(root, "public", "images"), "a.png", 40, 40);
        const file = path.join(root, "public", "images", "a.png");
        const cacheFile = path.join(root, ".cache", "manifest.json");

        await run(root, resolveOptions({ onlyUsed: false }), cacheFile);
        const first = await readFile(file);
        const firstStat = await stat(file);

        await run(root, resolveOptions({ onlyUsed: false }), cacheFile);
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

        await run(root, resolveOptions({ onlyUsed: false }), cacheFile);
        await writeFixturePng(dir, "a.png", 80, 60);
        const entries = await run(root, resolveOptions({ onlyUsed: false }), cacheFile);

        expect(entries[0].width).toBe(80);
        expect(entries[0].height).toBe(60);
        await cleanup(root);
    });
});
