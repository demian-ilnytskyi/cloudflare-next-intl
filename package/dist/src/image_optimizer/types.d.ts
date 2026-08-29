export type ImageFormat = "avif" | "webp";
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
    /** Compression quality (1-100). Default: inherits global */
    quality?: number;
    /** Blur placeholder settings for this image, or `false` to disable. Default: inherits global */
    blur?: boolean | ImageBlurOptions;
}
export interface ImageOptimizerPluginOptions {
    /** Enable or disable image optimization. Default: true */
    enabled?: boolean;
    /** Directories scanned recursively relative to project root. Default: ["public/images", "public/icons"] */
    dirs?: string[];
    /** Target directory for optimized assets. Default: "public/generated" */
    outDir?: string;
    /** Max width to downscale oversized images, or `false` to disable. Default: 1920 */
    maxWidth?: number | false;
    /** Compression quality for rasters. Default: 80 */
    quality?: number;
    /** Target sibling formats, or `false` to disable format conversions. Default: ["avif", "webp"] */
    formats?: ImageFormat[] | false;
    /** Output path for generated JSON manifest. Default: "public/generated/images.json" */
    manifest?: string;
    /** Global blur placeholder settings, or `false` to disable blur generation. Default: true */
    blur?: boolean | ImageBlurOptions;
    /** Run on dev server as well as production build. Default: true */
    dev?: boolean;
    /** Cache directory. Default: "node_modules/.cache/cloudflare-next-intl/image-optimizer" */
    cacheDir?: string;
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
    overrides: Record<string, ImageOverrideOptions>;
}
export interface ResolvedImageConfig {
    maxWidth: number | false;
    quality: number;
    formats: ImageFormat[];
    blur: ResolvedBlurOptions;
}
export interface OptimizedImage {
    originalSrc: string;
    src: string;
    width: number;
    height: number;
    blurDataURL?: string;
    blurWidth?: number;
    blurHeight?: number;
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
