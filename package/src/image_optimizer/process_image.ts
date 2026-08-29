import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolveImageConfig } from "./types.js";
import type { ImageFormat, OptimizedImage, ResolvedBlurOptions, ResolvedOptions } from "./types.js";

export function toPublicSrc(absolutePath: string, publicRoot: string): string {
    const relative = path.relative(publicRoot, absolutePath);
    return `/${relative.split(path.sep).join("/")}`;
}

export function toGeneratedPath(
    absolutePath: string,
    publicRoot: string,
    outDir: string,
    root: string,
): { targetFile: string; targetSrc: string } {
    const relative = path.relative(publicRoot, absolutePath);
    const resolvedOutDir = path.resolve(root, outDir);
    const targetFile = path.join(resolvedOutDir, relative);
    const outDirRelativePublic = path.relative(publicRoot, resolvedOutDir);
    const targetSrc = `/${path.join(outDirRelativePublic, relative).split(path.sep).join("/")}`;
    return { targetFile, targetSrc };
}

export async function makeBlurDataURL(
    targetFile: string,
    sourceWidth: number,
    sourceHeight: number,
    blurOptions: ResolvedBlurOptions,
): Promise<{ blurDataURL: string; blurWidth: number; blurHeight: number }> {
    const blurFile = targetFile.replace(/\.[^.]+$/, ".blur.webp");
    let blurWidth: number;
    let blurHeight: number;

    if (sourceWidth >= sourceHeight) {
        blurWidth = blurOptions.size;
        blurHeight = Math.max(Math.round((sourceHeight / sourceWidth) * blurOptions.size), 1);
    } else {
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

async function encodeSibling(
    targetFile: string,
    sourcePath: string,
    format: ImageFormat,
    quality: number,
    maxWidth: number | false,
    needsResize: boolean,
): Promise<void> {
    const target = targetFile.replace(/\.[^.]+$/, `.${format}`);
    let pipeline = sharp(sourcePath);
    if (needsResize) {
        pipeline = pipeline.resize({ width: maxWidth as number });
    }
    const encoded = format === "avif"
        ? pipeline.avif({ quality })
        : pipeline.webp({ quality });
    await encoded.toFile(target);
}

export async function processImage(
    absolutePath: string,
    publicRoot: string,
    options: ResolvedOptions,
    root: string = path.dirname(publicRoot),
): Promise<OptimizedImage> {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);

    const metadata = await sharp(absolutePath).metadata();
    const sourceWidth = metadata.width as number;
    const sourceHeight = metadata.height as number;
    const needsResize = typeof config.maxWidth === "number" && sourceWidth > config.maxWidth;

    const width = needsResize ? (config.maxWidth as number) : sourceWidth;
    const height = needsResize
        ? Math.round((sourceHeight * (config.maxWidth as number)) / sourceWidth)
        : sourceHeight;

    const { targetFile, targetSrc } = toGeneratedPath(
        absolutePath,
        publicRoot,
        options.outDir,
        root,
    );

    await mkdir(path.dirname(targetFile), { recursive: true });

    let pipeline = sharp(absolutePath);
    if (needsResize) {
        pipeline = pipeline.resize({ width: config.maxWidth as number });
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const encoded = extension === ".png"
        ? pipeline.png({ quality: config.quality, compressionLevel: 9 })
        : pipeline.jpeg({ quality: config.quality, mozjpeg: true });

    await encoded.toFile(targetFile);

    for (const format of config.formats) {
        await encodeSibling(
            targetFile,
            absolutePath,
            format,
            config.quality,
            config.maxWidth,
            needsResize,
        );
    }

    let blurResult: { blurDataURL: string; blurWidth: number; blurHeight: number } | undefined;
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
