import type { ImageFormat, OptimizedImage, OptimizedImageSource, ResolvedBlurOptions, ResolvedOptions } from "./types.js";
export declare const EXTENSION_BY_FORMAT: Record<ImageFormat, string>;
export declare function mimeTypeFor(format: ImageFormat | "original", originalSrc: string): string;
/**
 * <picture> tries <source> tags in document order, so sources must follow the
 * user's own `formats` order (their priority) with "original" always last as fallback.
 */
export declare function sortSources(sources: OptimizedImageSource[], formats: ImageFormat[]): OptimizedImageSource[];
export declare function toPublicSrc(absolutePath: string, publicRoot: string): string;
export declare function toGeneratedPath(absolutePath: string, publicRoot: string, outDir: string, root: string): {
    targetFile: string;
    targetSrc: string;
};
/** Suffixes a generated file/src path with `-{width}w` so multiple widths of the same image don't collide, e.g. hero.webp -> hero-400w.webp. The default (first/primary) width keeps the unsuffixed name for backward compatibility. */
export declare function withWidthSuffix(pathStr: string, width: number, isDefault: boolean): string;
export declare function makeBlurDataURL(targetFile: string, sourceWidth: number, sourceHeight: number, blurOptions: ResolvedBlurOptions): Promise<{
    blurDataURL: string;
    blurWidth: number;
    blurHeight: number;
}>;
export declare function processImage(absolutePath: string, publicRoot: string, options: ResolvedOptions, root?: string): Promise<OptimizedImage>;
