import { bench, describe } from "vitest";
import sharp from "sharp";
import { makeTempDir, writeFixtureJpg, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";
import { processImage } from "./process_image.js";
import { resolveOptions } from "./types.js";

const root = await makeTempDir();

const smallPng = await writeFixturePng(root, "small.png", 200, 150);
const largePng = await writeFixturePng(root, "large.png", 2400, 1600);
const photoJpg = await writeFixtureJpg(root, "photo.jpg", 1600, 1200);

const largeBuffer = await sharp(largePng).toBuffer();
const photoBuffer = await sharp(photoJpg).toBuffer();

describe("avif encode: effort trade-off", () => {
    bench("effort 0 (fastest, default quality)", async () => {
        await sharp(photoBuffer).avif({ quality: 80, effort: 0 }).toBuffer();
    });
    bench("effort 4 (sharp default)", async () => {
        await sharp(photoBuffer).avif({ quality: 80 }).toBuffer();
    });
    bench("effort 9 (max compression, slowest)", async () => {
        await sharp(photoBuffer).avif({ quality: 80, effort: 9 }).toBuffer();
    });
});

describe("webp encode: effort trade-off", () => {
    bench("effort 0 (fastest)", async () => {
        await sharp(photoBuffer).webp({ quality: 80, effort: 0 }).toBuffer();
    });
    bench("effort 4 (sharp default)", async () => {
        await sharp(photoBuffer).webp({ quality: 80 }).toBuffer();
    });
    bench("effort 6 (max compression, slowest)", async () => {
        await sharp(photoBuffer).webp({ quality: 80, effort: 6 }).toBuffer();
    });
});

describe("resize kernel trade-off (downscale 2400x1600 -> 800)", () => {
    bench("kernel: nearest (fastest, lowest quality)", async () => {
        await sharp(largeBuffer).resize({ width: 800, kernel: "nearest" }).webp({ quality: 80 }).toBuffer();
    });
    bench("kernel: lanczos3 (sharp default)", async () => {
        await sharp(largeBuffer).resize({ width: 800 }).webp({ quality: 80 }).toBuffer();
    });
    bench("kernel: mitchell (mid-quality)", async () => {
        await sharp(largeBuffer).resize({ width: 800, kernel: "mitchell" }).webp({ quality: 80 }).toBuffer();
    });
});

describe("mozjpeg vs baseline jpeg encode", () => {
    bench("baseline jpeg", async () => {
        await sharp(photoBuffer).jpeg({ quality: 80 }).toBuffer();
    });
    bench("mozjpeg (current production setting)", async () => {
        await sharp(photoBuffer).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    });
});

describe("processImage full pipeline (single format + blur)", () => {
    bench("small image (200x150)", async () => {
        await processImage(smallPng, root, resolveOptions({ formats: ["webp"] }), root);
    });
    bench("large image requiring downscale (2400x1600 -> 1920)", async () => {
        await processImage(largePng, root, resolveOptions({ formats: ["webp"] }), root);
    });
});

describe("processImage: blur enabled vs disabled overhead", () => {
    bench("with blur placeholder", async () => {
        await processImage(photoJpg, root, resolveOptions({ formats: ["webp"], blur: true }), root);
    });
    bench("without blur placeholder", async () => {
        await processImage(photoJpg, root, resolveOptions({ formats: ["webp"], blur: false }), root);
    });
});
