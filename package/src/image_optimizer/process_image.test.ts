import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_BLUR_OPTIONS, resolveOptions } from "./types.js";
import { makeBlurDataURL, mimeTypeFor, processImage, toGeneratedPath, toPublicSrc } from "./process_image.js";
import { cleanup, makeTempDir, writeFixtureJpg, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

describe("process_image", () => {
    it("toPublicSrc builds a rooted posix path", () => {
        const root = path.join("/tmp", "site");
        const publicRoot = path.join(root, "public");
        const file = path.join(publicRoot, "images", "a.png");
        expect(toPublicSrc(file, publicRoot)).toBe("/images/a.png");
    });

    it("toGeneratedPath builds target paths under outDir", () => {
        const root = path.join("/tmp", "site");
        const publicRoot = path.join(root, "public");
        const file = path.join(publicRoot, "images", "a.png");
        const { targetFile, targetSrc } = toGeneratedPath(file, publicRoot, "public/generated", root);
        expect(targetFile).toBe(path.join(publicRoot, "generated", "images", "a.png"));
        expect(targetSrc).toBe("/generated/images/a.png");
    });

    it("oversized image is downscaled into outDir and emitted as webp by default", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "big.png", 200, 100);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({ maxWidth: 50 }),
            root,
        );

        expect(result.originalSrc).toBe("/images/big.png");
        expect(result.src).toBe("/generated/images/big.webp");
        expect(result.width).toBe(50);
        expect(result.height).toBe(25);

        const targetFile = path.join(publicRoot, "generated", "images", "big.webp");
        const targetMeta = await sharp(targetFile).metadata();
        expect(targetMeta.width).toBe(50);
        expect(targetMeta.format).toBe("webp");

        await cleanup(root);
    });

    it("processes jpeg images and handles disabled blur and formats", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixtureJpg(path.join(publicRoot, "images"), "photo.jpg", 100, 100);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({
                blur: false,
                formats: false,
            }),
            root,
        );

        expect(result.originalSrc).toBe("/images/photo.jpg");
        expect(result.src).toBe("/generated/images/photo.jpg");
        expect(result.blurDataURL).toBeUndefined();
        expect(existsSync(path.join(publicRoot, "generated", "images", "photo.jpg"))).toBe(true);
        expect(existsSync(path.join(publicRoot, "generated", "images", "photo.blur.webp"))).toBe(false);

        await cleanup(root);
    });

    it("respects per-image override to disable maxWidth downscaling", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "big.png", 200, 100);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({
                maxWidth: 50,
                overrides: {
                    "/images/big.png": { maxWidth: false },
                },
            }),
            root,
        );

        expect(result.width).toBe(200);
        expect(result.height).toBe(100);

        const targetFile = path.join(publicRoot, "generated", "images", "big.webp");
        const targetMeta = await sharp(targetFile).metadata();
        expect(targetMeta.width).toBe(200);

        await cleanup(root);
    });

    it("respects per-image override to disable formats conversion", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "no-format.png", 100, 50);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({
                overrides: {
                    "/images/no-format.png": { formats: false },
                },
            }),
            root,
        );

        expect(result.src).toBe("/generated/images/no-format.png");
        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "no-format.png"))).toBe(true);
        expect(existsSync(path.join(genDir, "no-format.avif"))).toBe(false);
        expect(existsSync(path.join(genDir, "no-format.webp"))).toBe(false);

        await cleanup(root);
    });

    it("emits multiple formats when configured", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "a.png", 100, 50);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({ formats: ["avif", "webp"] }),
            root,
        );

        expect(result.src).toBe("/generated/images/a.avif");
        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "a.avif"))).toBe(true);
        expect(existsSync(path.join(genDir, "a.webp"))).toBe(true);
        expect(existsSync(path.join(genDir, "a.blur.webp"))).toBe(true);
        const avif = await stat(path.join(genDir, "a.avif"));
        expect(avif.size).toBeGreaterThan(0);
        await cleanup(root);
    });

    it("processImage generates a separate variant per extraWidths entry, deduped against the default width", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "multi-size.png", 1000, 500);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({
                formats: ["webp"],
                overrides: {
                    "/images/multi-size.png": { extraWidths: [200, 1000] },
                },
            }),
            root,
        );

        expect(result.width).toBe(1000);
        expect(result.src).toBe("/generated/images/multi-size.webp");
        expect(result.variants).toHaveLength(2);

        const thumb = result.variants?.find((v) => v.width === 200);
        expect(thumb?.src).toBe("/generated/images/multi-size-200w.webp");

        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "multi-size.webp"))).toBe(true);
        expect(existsSync(path.join(genDir, "multi-size-200w.webp"))).toBe(true);
        expect(existsSync(path.join(genDir, "multi-size-1000w.webp"))).toBe(false);

        await cleanup(root);
    });

    it("processImage omits `variants` entirely when there's only one size", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "single.png", 100, 100);

        const result = await processImage(file, publicRoot, resolveOptions({ formats: ["webp"] }), root);

        expect(result.variants).toBeUndefined();
        await cleanup(root);
    });

    it("falls back to jpeg mime for an unrecognized original extension", () => {
        expect(mimeTypeFor("original", "/images/icon.bmp")).toBe("image/jpeg");
    });

    it("emits explicit png and jpeg formats when configured", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "explicit.png", 40, 20);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({ formats: ["png", "jpeg"] }),
            root,
        );

        expect(result.src).toBe("/generated/images/explicit.png");
        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "explicit.png"))).toBe(true);
        expect(existsSync(path.join(genDir, "explicit.jpg"))).toBe(true);
        expect(result.sources?.map((s) => s.format)).toEqual(["png", "jpeg"]);
        await cleanup(root);
    });

    it("emits gif and tiff siblings when configured", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "multi.png", 40, 20);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({ formats: ["gif", "tiff"] }),
            root,
        );

        expect(result.src).toBe("/generated/images/multi.gif");
        const genDir = path.join(publicRoot, "generated", "images");
        for (const ext of ["gif", "tiff"]) {
            expect(existsSync(path.join(genDir, `multi.${ext}`))).toBe(true);
        }
        expect(result.sources?.map((s) => s.format)).toEqual(["gif", "tiff"]);
        await cleanup(root);
    });

    it.each(["heif", "jp2", "jxl"] as const)(
        "attempts %s encoding (skips assertion if this libvips build lacks support)",
        async (format) => {
            const root = await makeTempDir();
            const publicRoot = path.join(root, "public");
            const file = await writeFixturePng(path.join(publicRoot, "images"), `${format}-src.png`, 40, 20);

            try {
                const result = await processImage(
                    file,
                    publicRoot,
                    resolveOptions({ formats: [format] }),
                    root,
                );
                expect(result.src).toBe(`/generated/images/${format}-src.${format}`);
            } catch (error) {
                expect(String(error)).toMatch(new RegExp(format, "i"));
            }
            await cleanup(root);
        },
    );

    it("blur data url is a small inline webp with height >= width aspect ratio", async () => {
        const root = await makeTempDir();
        const file = await writeFixturePng(root, "tall.png", 50, 100);

        const buffer = await readFile(file);
        const blur = await makeBlurDataURL(buffer, file, 50, 100, DEFAULT_BLUR_OPTIONS);

        expect(blur.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
        expect(blur.blurWidth).toBe(4);
        expect(blur.blurHeight).toBe(8);
        expect(existsSync(path.join(root, "tall.blur.webp"))).toBe(true);
        await cleanup(root);
    });
});
