import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_BLUR_OPTIONS, DEFAULT_OPTIONS, resolveOptions } from "./types.js";
import { makeBlurDataURL, processImage, toGeneratedPath, toPublicSrc } from "./process_image.js";
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

    it("oversized image is downscaled into outDir preserving aspect ratio", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "big.png", 4000, 2000);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({ maxWidth: 1000 }),
            root,
        );

        expect(result.originalSrc).toBe("/images/big.png");
        expect(result.src).toBe("/generated/images/big.png");
        expect(result.width).toBe(1000);
        expect(result.height).toBe(500);

        const targetFile = path.join(publicRoot, "generated", "images", "big.png");
        const targetMeta = await sharp(targetFile).metadata();
        expect(targetMeta.width).toBe(1000);

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
        expect(result.blurDataURL).toBeUndefined();
        expect(existsSync(path.join(publicRoot, "generated", "images", "photo.jpg"))).toBe(true);
        expect(existsSync(path.join(publicRoot, "generated", "images", "photo.blur.webp"))).toBe(false);

        await cleanup(root);
    });

    it("respects per-image override to disable maxWidth downscaling", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "big.png", 4000, 2000);

        const result = await processImage(
            file,
            publicRoot,
            resolveOptions({
                maxWidth: 1000,
                overrides: {
                    "/images/big.png": { maxWidth: false },
                },
            }),
            root,
        );

        expect(result.width).toBe(4000);
        expect(result.height).toBe(2000);

        const targetFile = path.join(publicRoot, "generated", "images", "big.png");
        const targetMeta = await sharp(targetFile).metadata();
        expect(targetMeta.width).toBe(4000);

        await cleanup(root);
    });

    it("respects per-image override to disable formats conversion", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "no-format.png", 600, 400);

        await processImage(
            file,
            publicRoot,
            resolveOptions({
                overrides: {
                    "/images/no-format.png": { formats: false },
                },
            }),
            root,
        );

        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "no-format.png"))).toBe(true);
        expect(existsSync(path.join(genDir, "no-format.avif"))).toBe(false);
        expect(existsSync(path.join(genDir, "no-format.webp"))).toBe(false);

        await cleanup(root);
    });

    it("avif, webp and blur siblings are emitted in outDir", async () => {
        const root = await makeTempDir();
        const publicRoot = path.join(root, "public");
        const file = await writeFixturePng(path.join(publicRoot, "images"), "a.png", 600, 400);

        await processImage(file, publicRoot, DEFAULT_OPTIONS, root);

        const genDir = path.join(publicRoot, "generated", "images");
        expect(existsSync(path.join(genDir, "a.avif"))).toBe(true);
        expect(existsSync(path.join(genDir, "a.webp"))).toBe(true);
        expect(existsSync(path.join(genDir, "a.blur.webp"))).toBe(true);
        const avif = await stat(path.join(genDir, "a.avif"));
        expect(avif.size).toBeGreaterThan(0);
        await cleanup(root);
    });

    it("blur data url is a small inline webp with height >= width aspect ratio", async () => {
        const root = await makeTempDir();
        const file = await writeFixturePng(root, "tall.png", 400, 800);

        const blur = await makeBlurDataURL(file, 400, 800, DEFAULT_BLUR_OPTIONS);

        expect(blur.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
        expect(blur.blurWidth).toBe(4);
        expect(blur.blurHeight).toBe(8);
        expect(existsSync(path.join(root, "tall.blur.webp"))).toBe(true);
        await cleanup(root);
    });
});
