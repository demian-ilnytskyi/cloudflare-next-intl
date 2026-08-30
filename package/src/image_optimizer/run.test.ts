import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveOptions } from "./types.js";
import { collectImages, mapWithConcurrency, mergeOverrides, run, targetAndSiblingPaths } from "./run.js";
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

    it("mergeOverrides unions extraWidths instead of letting the configured override replace scanned widths", () => {
        const scanned = {
            "/images/hero.png": { extraWidths: [200] },
        };
        const configured = {
            "/images/hero.png": { extraWidths: [1200], quality: 90 },
        };

        const merged = mergeOverrides(scanned, configured);

        expect(merged["/images/hero.png"].extraWidths?.sort((a, b) => a - b)).toEqual([200, 1200]);
        expect(merged["/images/hero.png"].quality).toBe(90);
    });

    it("mergeOverrides takes the configured extraWidths when the scanned override has none", () => {
        const scanned = {
            "/images/hero.png": { quality: 60 },
        };
        const configured = {
            "/images/hero.png": { extraWidths: [1200] },
        };

        const merged = mergeOverrides(scanned, configured);

        expect(merged["/images/hero.png"]).toEqual({ quality: 60, extraWidths: [1200] });
    });

    it("mergeOverrides keeps the scanned extraWidths when the configured override doesn't set any", () => {
        const scanned = {
            "/images/hero.png": { extraWidths: [200] },
        };
        const configured = {
            "/images/hero.png": { quality: 90 },
        };

        const merged = mergeOverrides(scanned, configured);

        expect(merged["/images/hero.png"]).toEqual({ extraWidths: [200], quality: 90 });
    });

    it("targetAndSiblingPaths returns primary path, siblings, and blur when enabled", async () => {
        const root = await makeProject();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "hero.png", 400, 300);

        const optionsMultiple = resolveOptions({
            formats: ["webp", "avif"],
            blur: true,
        });
        const targetsMultiple = await targetAndSiblingPaths(file, publicRoot, optionsMultiple, root);
        expect(targetsMultiple).toEqual([
            path.join(root, "public", "generated", "images", "hero.webp"),
            path.join(root, "public", "generated", "images", "hero.avif"),
            path.join(root, "public", "generated", "images", "hero.blur.webp"),
        ]);

        const optionsOriginal = resolveOptions({
            formats: false,
            blur: false,
        });
        const targetsOriginal = await targetAndSiblingPaths(file, publicRoot, optionsOriginal, root);
        expect(targetsOriginal).toEqual([
            path.join(root, "public", "generated", "images", "hero.png"),
        ]);

        await cleanup(root);
    });

    it("targetAndSiblingPaths uses the downscaled maxWidth as the default variant width", async () => {
        const root = await makeProject();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "wide.png", 2000, 1000);

        const options = resolveOptions({ formats: ["webp"], blur: false, maxWidth: 800 });
        const targets = await targetAndSiblingPaths(file, publicRoot, options, root);

        expect(targets).toEqual([
            path.join(root, "public", "generated", "images", "wide.webp"),
        ]);

        await cleanup(root);
    });

    it("targetAndSiblingPaths includes suffixed target files for each extraWidths variant", async () => {
        const root = await makeProject();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "multi-size.png", 1000, 500);

        const options = resolveOptions({
            formats: ["webp"],
            blur: false,
            overrides: {
                "/images/multi-size.png": { extraWidths: [200, 1000] },
            },
        });

        const targets = await targetAndSiblingPaths(file, publicRoot, options, root);
        expect(targets).toEqual([
            path.join(root, "public", "generated", "images", "multi-size.webp"),
            path.join(root, "public", "generated", "images", "multi-size-200w.webp"),
        ]);

        await cleanup(root);
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
        await writeFixturePng(path.join(root, "public", "images"), "used.png", 40, 40);
        await writeFixturePng(path.join(root, "public", "images"), "unused.png", 40, 40);

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

describe("mapWithConcurrency", () => {
    it("returns results in input order", async () => {
        const delays = [30, 5, 20, 1];
        const result = await mapWithConcurrency(delays, 2, async (ms, i) => {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return i;
        });
        expect(result).toEqual([0, 1, 2, 3]);
    });

    it("never runs more than `limit` workers at once", async () => {
        let active = 0;
        let peak = 0;
        await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
        });
        expect(peak).toBe(2);
    });

    it("treats a limit below 1 as serial", async () => {
        let peak = 0;
        let active = 0;
        await mapWithConcurrency([1, 2, 3], 0, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active -= 1;
        });
        expect(peak).toBe(1);
    });

    it("handles an empty list", async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });
});
