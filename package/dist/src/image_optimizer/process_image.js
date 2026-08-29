import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolveImageConfig } from "./types.js";
export function toPublicSrc(absolutePath, publicRoot) {
    const relative = path.relative(publicRoot, absolutePath);
    return `/${relative.split(path.sep).join("/")}`;
}
export function toGeneratedPath(absolutePath, publicRoot, outDir, root) {
    const relative = path.relative(publicRoot, absolutePath);
    const resolvedOutDir = path.resolve(root, outDir);
    const targetFile = path.join(resolvedOutDir, relative);
    const outDirRelativePublic = path.relative(publicRoot, resolvedOutDir);
    const targetSrc = `/${path.join(outDirRelativePublic, relative).split(path.sep).join("/")}`;
    return { targetFile, targetSrc };
}
export async function makeBlurDataURL(targetFile, sourceWidth, sourceHeight, blurOptions) {
    const blurFile = targetFile.replace(/\.[^.]+$/, ".blur.webp");
    let blurWidth;
    let blurHeight;
    if (sourceWidth >= sourceHeight) {
        blurWidth = blurOptions.size;
        blurHeight = Math.max(Math.round((sourceHeight / sourceWidth) * blurOptions.size), 1);
    }
    else {
        blurWidth = Math.max(Math.round((sourceWidth / sourceHeight) * blurOptions.size), 1);
        blurHeight = blurOptions.size;
    }
    const buffer = await sharp(targetFile)
        .resize({ width: blurWidth, height: blurHeight, fit: "inside" })
        .webp({ quality: blurOptions.quality })
        .toBuffer();
    await sharp(buffer).toFile(blurFile);
    return {
        blurDataURL: `data:image/webp;base64,${buffer.toString("base64")}`,
        blurWidth,
        blurHeight,
    };
}
async function encodeSibling(targetFile, sourcePath, format, quality, maxWidth, needsResize) {
    const target = targetFile.replace(/\.[^.]+$/, `.${format}`);
    let pipeline = sharp(sourcePath);
    if (needsResize) {
        pipeline = pipeline.resize({ width: maxWidth });
    }
    const encoded = format === "avif"
        ? pipeline.avif({ quality })
        : pipeline.webp({ quality });
    await encoded.toFile(target);
}
export async function processImage(absolutePath, publicRoot, options, root = path.dirname(publicRoot)) {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const metadata = await sharp(absolutePath).metadata();
    const sourceWidth = metadata.width;
    const sourceHeight = metadata.height;
    const needsResize = typeof config.maxWidth === "number" && sourceWidth > config.maxWidth;
    const width = needsResize ? config.maxWidth : sourceWidth;
    const height = needsResize
        ? Math.round((sourceHeight * config.maxWidth) / sourceWidth)
        : sourceHeight;
    const { targetFile, targetSrc } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);
    await mkdir(path.dirname(targetFile), { recursive: true });
    let pipeline = sharp(absolutePath);
    if (needsResize) {
        pipeline = pipeline.resize({ width: config.maxWidth });
    }
    const extension = path.extname(absolutePath).toLowerCase();
    const encoded = extension === ".png"
        ? pipeline.png({ quality: config.quality, compressionLevel: 9 })
        : pipeline.jpeg({ quality: config.quality, mozjpeg: true });
    await encoded.toFile(targetFile);
    for (const format of config.formats) {
        await encodeSibling(targetFile, absolutePath, format, config.quality, config.maxWidth, needsResize);
    }
    let blurResult;
    if (config.blur.enabled) {
        blurResult = await makeBlurDataURL(targetFile, width, height, config.blur);
    }
    return {
        originalSrc: publicSrc,
        src: targetSrc,
        width,
        height,
        blurDataURL: blurResult?.blurDataURL,
        blurWidth: blurResult?.blurWidth,
        blurHeight: blurResult?.blurHeight,
    };
}
