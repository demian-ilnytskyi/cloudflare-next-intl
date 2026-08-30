import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolveImageConfig } from "./types.js";
const MIME_BY_FORMAT = {
    avif: "image/avif",
    webp: "image/webp",
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    tiff: "image/tiff",
    heif: "image/heif",
    jp2: "image/jp2",
    jxl: "image/jxl",
};
const MIME_BY_EXTENSION = {
    ".avif": "image/avif",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".heif": "image/heif",
    ".heic": "image/heif",
    ".jp2": "image/jp2",
    ".jxl": "image/jxl",
};
export const EXTENSION_BY_FORMAT = {
    avif: "avif",
    webp: "webp",
    png: "png",
    jpeg: "jpg",
    gif: "gif",
    tiff: "tiff",
    heif: "heif",
    jp2: "jp2",
    jxl: "jxl",
};
export function mimeTypeFor(format, originalSrc) {
    if (format === "original") {
        return MIME_BY_EXTENSION[path.extname(originalSrc).toLowerCase()] ?? "image/jpeg";
    }
    return MIME_BY_FORMAT[format];
}
export function sortSources(sources, formats) {
    const priority = [...formats, "original"];
    return [...sources].sort((a, b) => priority.indexOf(a.format) - priority.indexOf(b.format));
}
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
export function withWidthSuffix(pathStr, width, isDefault) {
    if (isDefault)
        return pathStr;
    return pathStr.replace(/(\.[^./]+)$/, `-${width}w$1`);
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
async function encodeFormat(targetFile, sourcePath, format, quality, targetWidth) {
    let pipeline = sharp(sourcePath);
    if (targetWidth !== undefined) {
        pipeline = pipeline.resize({ width: targetWidth });
    }
    let encoded;
    if (format === "avif") {
        encoded = pipeline.avif({ quality });
    }
    else if (format === "webp") {
        encoded = pipeline.webp({ quality });
    }
    else if (format === "png") {
        encoded = pipeline.png({ quality, compressionLevel: 9 });
    }
    else if (format === "jpeg") {
        encoded = pipeline.jpeg({ quality, mozjpeg: true });
    }
    else if (format === "gif") {
        encoded = pipeline.gif();
    }
    else if (format === "tiff") {
        encoded = pipeline.tiff({ quality });
    }
    else if (format === "heif") {
        encoded = pipeline.heif({ quality, compression: "hevc" });
    }
    else if (format === "jp2") {
        encoded = pipeline.jp2({ quality });
    }
    else if (format === "jxl") {
        encoded = pipeline.jxl({ quality });
    }
    else {
        const ext = path.extname(sourcePath).toLowerCase();
        encoded = ext === ".png"
            ? pipeline.png({ quality, compressionLevel: 9 })
            : pipeline.jpeg({ quality, mozjpeg: true });
    }
    await encoded.toFile(targetFile);
}
function resolveTargetWidth(requestedWidth, sourceWidth) {
    if (requestedWidth === false)
        return undefined;
    return requestedWidth < sourceWidth ? requestedWidth : undefined;
}
async function processVariant(absolutePath, publicSrc, targetFile, targetSrc, targetWidth, sourceWidth, sourceHeight, config, isDefault) {
    const width = targetWidth ?? sourceWidth;
    const height = targetWidth ? Math.round((sourceHeight * targetWidth) / sourceWidth) : sourceHeight;
    const primaryFormat = config.formats.length > 0
        ? config.formats[0]
        : "original";
    const primaryFile = withWidthSuffix(primaryFormat === "original" ? targetFile : targetFile.replace(/\.[^.]+$/, `.${EXTENSION_BY_FORMAT[primaryFormat]}`), width, isDefault);
    const primarySrc = withWidthSuffix(primaryFormat === "original" ? targetSrc : targetSrc.replace(/\.[^.]+$/, `.${EXTENSION_BY_FORMAT[primaryFormat]}`), width, isDefault);
    await encodeFormat(primaryFile, absolutePath, primaryFormat, config.quality, targetWidth);
    const sources = [
        { format: primaryFormat, src: primarySrc, type: mimeTypeFor(primaryFormat, publicSrc) },
    ];
    for (let i = 1; i < config.formats.length; i++) {
        const format = config.formats[i];
        const ext = EXTENSION_BY_FORMAT[format];
        const siblingFile = withWidthSuffix(targetFile.replace(/\.[^.]+$/, `.${ext}`), width, isDefault);
        await encodeFormat(siblingFile, absolutePath, format, config.quality, targetWidth);
        sources.push({
            format,
            src: withWidthSuffix(targetSrc.replace(/\.[^.]+$/, `.${ext}`), width, isDefault),
            type: mimeTypeFor(format, publicSrc),
        });
    }
    let blurResult;
    if (config.blur.enabled) {
        blurResult = await makeBlurDataURL(primaryFile, width, height, config.blur);
    }
    return {
        width,
        height,
        src: primarySrc,
        sources: sortSources(sources, config.formats),
        blurDataURL: blurResult?.blurDataURL,
        blurWidth: blurResult?.blurWidth,
        blurHeight: blurResult?.blurHeight,
    };
}
export async function processImage(absolutePath, publicRoot, options, root = path.dirname(publicRoot)) {
    const publicSrc = toPublicSrc(absolutePath, publicRoot);
    const config = resolveImageConfig(publicSrc, options);
    const metadata = await sharp(absolutePath).metadata();
    const sourceWidth = metadata.width;
    const sourceHeight = metadata.height;
    const { targetFile, targetSrc } = toGeneratedPath(absolutePath, publicRoot, options.outDir, root);
    await mkdir(path.dirname(targetFile), { recursive: true });
    const defaultTargetWidth = resolveTargetWidth(config.maxWidth, sourceWidth);
    const requestedWidths = Array.from(new Set(config.extraWidths));
    const extraTargetWidths = requestedWidths
        .map((w) => resolveTargetWidth(w, sourceWidth) ?? sourceWidth)
        .filter((w) => w !== (defaultTargetWidth ?? sourceWidth));
    const defaultVariant = await processVariant(absolutePath, publicSrc, targetFile, targetSrc, defaultTargetWidth, sourceWidth, sourceHeight, config, true);
    const variants = [defaultVariant];
    for (const width of extraTargetWidths) {
        variants.push(await processVariant(absolutePath, publicSrc, targetFile, targetSrc, width, sourceWidth, sourceHeight, config, false));
    }
    return {
        originalSrc: publicSrc,
        ...defaultVariant,
        variants: variants.length > 1 ? variants : undefined,
    };
}
