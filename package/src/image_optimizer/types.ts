import { cpus } from "node:os";

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
    /** Encoder effort (0-9) for this image. Default: inherits global */
    effort?: number;
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
    /** Images processed in parallel. Default: cpu count, clamped to 1-8 */
    concurrency?: number;
    /** Encoder effort (0-9) for avif/webp/png/heif/jxl. Default: sharp's own default */
    effort?: number;
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
    concurrency: number;
    effort: number | undefined;
}

export interface ResolvedImageConfig {
    maxWidth: number | false;
    extraWidths: number[];
    quality: number;
    formats: ImageFormat[];
    blur: ResolvedBlurOptions;
    effort: number | undefined;
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

export const SUPPORTED_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".webp", ".avif"];

export const DEFAULT_BLUR_OPTIONS: ResolvedBlurOptions = {
    enabled: true,
    size: 8,
    quality: 70,
    stdDeviation: 20,
};

export const DEFAULT_OPTIONS: ResolvedOptions = {
    enabled: true,
    dirs: ["public/images", "public/icons"],
    outDir: "public/generated",
    maxWidth: 1920,
    quality: 80,
    formats: ["webp"] as ImageFormat[],
    manifest: "public/generated/images.json",
    blur: DEFAULT_BLUR_OPTIONS,
    dev: true,
    cacheDir: "node_modules/.cache/cloudflare-next-intl/image-optimizer",
    onlyUsed: true,
    overrides: {},
    concurrency: Math.max(1, Math.min(cpus().length, 8)),
    effort: undefined,
};

export function resolveBlurOptions(
    blur: boolean | ImageBlurOptions | undefined,
    parentDefault: ResolvedBlurOptions = DEFAULT_BLUR_OPTIONS,
): ResolvedBlurOptions {
    if (blur === false) {
        return { ...parentDefault, enabled: false };
    }
    if (blur === true) {
        return { ...parentDefault, enabled: true };
    }
    if (blur === undefined) {
        return { ...parentDefault };
    }
    return {
        enabled: blur.enabled ?? parentDefault.enabled,
        size: blur.size ?? parentDefault.size,
        quality: blur.quality ?? parentDefault.quality,
        stdDeviation: blur.stdDeviation ?? parentDefault.stdDeviation,
    };
}

export function resolveOptions(
    options: ImageOptimizerPluginOptions | undefined,
): ResolvedOptions {
    const raw = options ?? {};
    const formats = raw.formats === false ? [] : (raw.formats ?? DEFAULT_OPTIONS.formats);
    const maxWidth = raw.maxWidth === false ? false : (raw.maxWidth ?? DEFAULT_OPTIONS.maxWidth);
    const blur = resolveBlurOptions(raw.blur, DEFAULT_BLUR_OPTIONS);

    return {
        enabled: raw.enabled ?? DEFAULT_OPTIONS.enabled,
        dirs: raw.dirs ? [...raw.dirs] : [...DEFAULT_OPTIONS.dirs],
        outDir: raw.outDir ?? DEFAULT_OPTIONS.outDir,
        maxWidth,
        quality: raw.quality ?? DEFAULT_OPTIONS.quality,
        formats: [...formats],
        manifest: raw.manifest ?? DEFAULT_OPTIONS.manifest,
        blur,
        dev: raw.dev ?? DEFAULT_OPTIONS.dev,
        cacheDir: raw.cacheDir ?? DEFAULT_OPTIONS.cacheDir,
        onlyUsed: raw.onlyUsed ?? DEFAULT_OPTIONS.onlyUsed,
        overrides: raw.overrides ? { ...raw.overrides } : {},
        concurrency: Math.max(1, raw.concurrency ?? DEFAULT_OPTIONS.concurrency),
        effort: raw.effort,
    };
}

export function resolveImageConfig(
    publicSrc: string,
    options: ResolvedOptions,
): ResolvedImageConfig {
    const override = options.overrides[publicSrc];
    if (!override) {
        return {
            maxWidth: options.maxWidth,
            extraWidths: [],
            quality: options.quality,
            formats: options.formats,
            blur: options.blur,
            effort: options.effort,
        };
    }

    const formats = override.formats === false
        ? []
        : override.formats !== undefined
          ? [...override.formats]
          : options.formats;

    const maxWidth = override.maxWidth === false
        ? false
        : override.maxWidth !== undefined
          ? override.maxWidth
          : options.maxWidth;

    const quality = override.quality ?? options.quality;
    const effort = override.effort ?? options.effort;
    const blur = override.blur !== undefined
        ? resolveBlurOptions(override.blur, options.blur)
        : options.blur;
    const extraWidths = override.extraWidths ? [...override.extraWidths] : [];

    return { maxWidth, extraWidths, quality, formats, blur, effort };
}
