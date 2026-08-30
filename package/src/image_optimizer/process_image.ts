import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolveImageConfig } from "./types.js";
import type {
    ImageFormat,
    OptimizedImage,
    OptimizedImageSource,
    ResolvedBlurOptions,
    ResolvedOptions,
} from "./types.js";

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
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

const MIME_BY_EXTENSION: Record<string, string> = {
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

const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
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

export function mimeTypeFor(format: ImageFormat | "original", originalSrc: string): string {
    if (format === "original") {
        return MIME_BY_EXTENSION[path.extname(originalSrc).toLowerCase()] ?? "image/jpeg";
    }
    return MIME_BY_FORMAT[format];
}

/**
 * <picture> tries <source> tags in document order, so sources must follow the
 * user's own `formats` order (their priority) with "original" always last as fallback.
 */
export function sortSources(
    sources: OptimizedImageSource[],
    formats: ImageFormat[],
): OptimizedImageSource[] {
    const priority: readonly (ImageFormat | "original")[] = [...formats, "original"];
    return [...sources].sort(
        (a, b) => priority.indexOf(a.format) - priority.indexOf(b.format),
    );
}

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

async function encodeFormat(
    targetFile: string,
    sourcePath: string,
    format: ImageFormat | "original",
    quality: number,
    maxWidth: number | false,
    needsResize: boolean,
): Promise<void> {
    let pipeline = sharp(sourcePath);
    if (needsResize) {
        pipeline = pipeline.resize({ width: maxWidth as number });
    }

    let encoded;
    if (format === "avif") {
        encoded = pipeline.avif({ quality });
    } else if (format === "webp") {
        encoded = pipeline.webp({ quality });
    } else if (format === "png") {
        encoded = pipeline.png({ quality, compressionLevel: 9 });
    } else if (format === "jpeg") {
        encoded = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === "gif") {
        encoded = pipeline.gif();
    } else if (format === "tiff") {
        encoded = pipeline.tiff({ quality });
    } else if (format === "heif") {
        encoded = pipeline.heif({ quality, compression: "hevc" });
    } else if (format === "jp2") {
        encoded = pipeline.jp2({ quality });
    } else if (format === "jxl") {
        encoded = pipeline.jxl({ quality });
    } else {
        const ext = path.extname(sourcePath).toLowerCase();
        encoded = ext === ".png"
            ? pipeline.png({ quality, compressionLevel: 9 })
            : pipeline.jpeg({ quality, mozjpeg: true });
    }

    await encoded.toFile(targetFile);
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

    const primaryFormat: ImageFormat | "original" = config.formats.length > 0
        ? config.formats[0]
        : "original";

    const primaryFile = primaryFormat === "original"
        ? targetFile
        : targetFile.replace(/\.[^.]+$/, `.${EXTENSION_BY_FORMAT[primaryFormat]}`);

    const primarySrc = primaryFormat === "original"
        ? targetSrc
        : targetSrc.replace(/\.[^.]+$/, `.${EXTENSION_BY_FORMAT[primaryFormat]}`);

    await encodeFormat(
        primaryFile,
        absolutePath,
        primaryFormat,
        config.quality,
        config.maxWidth,
        needsResize,
    );

    const sources: OptimizedImageSource[] = [
        { format: primaryFormat, src: primarySrc, type: mimeTypeFor(primaryFormat, publicSrc) },
    ];

    for (let i = 1; i < config.formats.length; i++) {
        const format = config.formats[i];
        const ext = EXTENSION_BY_FORMAT[format];
        const siblingFile = targetFile.replace(/\.[^.]+$/, `.${ext}`);
        await encodeFormat(
            siblingFile,
            absolutePath,
            format,
            config.quality,
            config.maxWidth,
            needsResize,
        );
        sources.push({
            format,
            src: targetSrc.replace(/\.[^.]+$/, `.${ext}`),
            type: mimeTypeFor(format, publicSrc),
        });
    }

    let blurResult: { blurDataURL: string; blurWidth: number; blurHeight: number } | undefined;
    if (config.blur.enabled) {
        blurResult = await makeBlurDataURL(primaryFile, width, height, config.blur);
    }

    return {
        originalSrc: publicSrc,
        src: primarySrc,
        sources: sortSources(sources, config.formats),
        width,
        height,
        blurDataURL: blurResult?.blurDataURL,
        blurWidth: blurResult?.blurWidth,
        blurHeight: blurResult?.blurHeight,
    };
}
