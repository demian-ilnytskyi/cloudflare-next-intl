import type { ImageFormat, OptimizedImage, OptimizedImageSource, ResolvedBlurOptions, ResolvedOptions } from "./types.js";
export declare const EXTENSION_BY_FORMAT: Record<ImageFormat, string>;
export declare function mimeTypeFor(format: ImageFormat | "original", originalSrc: string): string;
export declare function sortSources(sources: OptimizedImageSource[], formats: ImageFormat[]): OptimizedImageSource[];
export declare function toPublicSrc(absolutePath: string, publicRoot: string): string;
export declare function toGeneratedPath(absolutePath: string, publicRoot: string, outDir: string, root: string): {
    targetFile: string;
    targetSrc: string;
};
export declare function withWidthSuffix(pathStr: string, width: number, isDefault: boolean): string;
export declare function makeBlurDataURL(targetFile: string, sourceWidth: number, sourceHeight: number, blurOptions: ResolvedBlurOptions): Promise<{
    blurDataURL: string;
    blurWidth: number;
    blurHeight: number;
}>;
export declare function processImage(absolutePath: string, publicRoot: string, options: ResolvedOptions, root?: string): Promise<OptimizedImage>;
