export const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg"];
export const DEFAULT_BLUR_OPTIONS = {
    enabled: true,
    size: 8,
    quality: 70,
    stdDeviation: 20,
};
export const DEFAULT_OPTIONS = {
    enabled: true,
    dirs: ["public/images", "public/icons"],
    outDir: "public/generated",
    maxWidth: 1920,
    quality: 80,
    formats: ["avif", "webp"],
    manifest: "public/generated/images.json",
    blur: DEFAULT_BLUR_OPTIONS,
    dev: true,
    cacheDir: "node_modules/.cache/cloudflare-next-intl/image-optimizer",
    overrides: {},
};
export function resolveBlurOptions(blur, parentDefault = DEFAULT_BLUR_OPTIONS) {
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
export function resolveOptions(options) {
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
        overrides: raw.overrides ? { ...raw.overrides } : {},
    };
}
export function resolveImageConfig(publicSrc, options) {
    const override = options.overrides[publicSrc];
    if (!override) {
        return {
            maxWidth: options.maxWidth,
            quality: options.quality,
            formats: options.formats,
            blur: options.blur,
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
    const blur = override.blur !== undefined
        ? resolveBlurOptions(override.blur, options.blur)
        : options.blur;
    return { maxWidth, quality, formats, blur };
}
