export type ImageFormat = "avif" | "webp" | "png" | "jpeg" | "gif" | "tiff" | "heif" | "jp2" | "jxl";
export interface ImageBlurOptions {
    /** Enable blur placeholder generation. Default: true */
    enabled?: boolean;
    /** Tiny thumbnail dimension (largest side). Default: 8 */
    size?: number;
    /** WebP thumbnail quality. Default: 70 */
    quality?: number;
    /** Gaussian blur stdDeviation for SVG filter. Default: 20 */
    stdDeviation?: number;
}
export interface ImageOverrideOptions {
    /** Formats to emit for this image, or `false` to disable format conversions. Default: inherits global */
    formats?: ImageFormat[] | false;
    /** Max width to downscale, or `false` to preserve original dimensions. Default: inherits global */
    maxWidth?: number | false;
    /**
     * Additional widths to also generate as separate variants, e.g. when the
     * same src is used at different sizes across the codebase (a thumbnail and
     * a hero). Populated automatically by scanning <Image width=...> usages;
     * merges (never overwrites) across multiple usages of the same src.
     */
    extraWidths?: number[];
    /** Compression quality (1-100). Default: inherits global */
    quality?: number;
    /** Blur placeholder settings for this image, or `false` to disable. Default: inherits global */
    blur?: boolean | ImageBlurOptions;
}
export interface ImageOptimizerPluginOptions {
    /** Enable or disable image optimization. Default: true */
    enabled?: boolean;
    /** Directories scanned recursively relative to project root when onlyUsed is false. Default: ["public/images", "public/icons"] */
    dirs?: string[];
    /** Target directory for optimized assets. Default: "public/generated" */
    outDir?: string;
    /** Max width to downscale oversized images, or `false` to disable. Default: 1920 */
    maxWidth?: number | false;
    /** Compression quality for rasters. Default: 80 */
    quality?: number;
    /** Target sibling formats, or `false` to disable format conversions. Default: ["webp"] */
    formats?: ImageFormat[] | false;
    /** Output path for generated JSON manifest. Default: "public/generated/images.json" */
    manifest?: string;
    /** Global blur placeholder settings, or `false` to disable blur generation. Default: true */
    blur?: boolean | ImageBlurOptions;
    /** Run on dev server as well as production build. Default: true */
    dev?: boolean;
    /** Cache directory. Default: "node_modules/.cache/cloudflare-next-intl/image-optimizer" */
    cacheDir?: string;
    /** Scan code files and optimize ONLY images actually referenced in <Image>. Default: true */
    onlyUsed?: boolean;
    /** Per-image overrides keyed by public src (e.g. `"/images/hero.png"`) */
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
/**
 * `src`/`width`/`height`/`sources`/`blur*` mirror the default variant (the
 * first one generated) so existing single-size lookups keep working; `variants`
 * carries every width actually requested via <Image width=...> across the
 * codebase, so the component can pick the closest match to what's rendered.
 */
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
