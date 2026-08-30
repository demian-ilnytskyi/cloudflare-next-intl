export type ImageFormat = "avif" | "webp" | "png" | "jpeg" | "gif" | "tiff" | "heif" | "jp2" | "jxl";
export interface ImageBlurOptions {
    enabled?: boolean;
    size?: number;
    quality?: number;
    stdDeviation?: number;
}
export interface ImageOverrideOptions {
    formats?: ImageFormat[] | false;
    maxWidth?: number | false;
    extraWidths?: number[];
    quality?: number;
    blur?: boolean | ImageBlurOptions;
}
export interface ImageOptimizerPluginOptions {
    enabled?: boolean;
    dirs?: string[];
    outDir?: string;
    maxWidth?: number | false;
    quality?: number;
    formats?: ImageFormat[] | false;
    manifest?: string;
    blur?: boolean | ImageBlurOptions;
    dev?: boolean;
    cacheDir?: string;
    onlyUsed?: boolean;
    overrides?: Record<string, ImageOverrideOptions>;
}
export interface ResolvedBlurOptions {
    enabled: boolean;
    size: number;
    quality: number;
    stdDeviation: number;
}
export interface ResolvedOptions {
    enabled: boolean;
    dirs: string[];
    outDir: string;
    maxWidth: number | false;
    quality: number;
    formats: ImageFormat[];
    manifest: string;
    blur: ResolvedBlurOptions;
    dev: boolean;
    cacheDir: string;
    onlyUsed: boolean;
    overrides: Record<string, ImageOverrideOptions>;
}
export interface ResolvedImageConfig {
    maxWidth: number | false;
    extraWidths: number[];
    quality: number;
    formats: ImageFormat[];
    blur: ResolvedBlurOptions;
}
export interface OptimizedImageSource {
    format: ImageFormat | "original";
    src: string;
    type: string;
}
export interface OptimizedImageVariant {
    width: number;
    height: number;
    src: string;
    sources?: OptimizedImageSource[];
    blurDataURL?: string;
    blurWidth?: number;
    blurHeight?: number;
}
export interface OptimizedImage extends OptimizedImageVariant {
    originalSrc: string;
    variants?: OptimizedImageVariant[];
}
export interface ManifestData {
    images: Record<string, OptimizedImage>;
}
export declare const SUPPORTED_EXTENSIONS: readonly string[];
export declare const DEFAULT_BLUR_OPTIONS: ResolvedBlurOptions;
export declare const DEFAULT_OPTIONS: ResolvedOptions;
export declare function resolveBlurOptions(blur: boolean | ImageBlurOptions | undefined, parentDefault?: ResolvedBlurOptions): ResolvedBlurOptions;
export declare function resolveOptions(options: ImageOptimizerPluginOptions | undefined): ResolvedOptions;
export declare function resolveImageConfig(publicSrc: string, options: ResolvedOptions): ResolvedImageConfig;
