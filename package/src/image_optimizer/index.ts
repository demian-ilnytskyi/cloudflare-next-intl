export {
    imageOptimizerPlugin,
    imageOptimizer,
    VIRTUAL_IMAGE_SHIM_ID,
    default,
} from "./plugin.js";

export {
    resolveOptions,
    resolveImageConfig,
    resolveBlurOptions,
    DEFAULT_OPTIONS,
    DEFAULT_BLUR_OPTIONS,
    SUPPORTED_EXTENSIONS,
    type ImageFormat,
    type ImageBlurOptions,
    type ImageOverrideOptions,
    type ImageOptimizerPluginOptions,
    type ResolvedBlurOptions,
    type ResolvedOptions,
    type ResolvedImageConfig,
    type OptimizedImage,
    type ManifestData,
} from "./types.js";

export {
    processImage,
    makeBlurDataURL,
    toGeneratedPath,
    toPublicSrc,
} from "./process_image.js";

export {
    renderManifest,
    writeManifest,
} from "./manifest.js";

export {
    isFresh,
    loadCache,
    saveCache,
    type CacheEntry,
    type CacheData,
} from "./cache.js";

export {
    collectImages,
    run,
} from "./run.js";

export {
    collectUsedImages,
    findCodeFiles,
    extractImageReferences,
    CODE_EXTENSIONS,
    IGNORED_DIRS,
} from "./scan_used.js";

export {
    getImageBlurSvg,
} from "./blur_svg.js";

export {
    type ManifestEntry,
} from "./next_image_shim.js";

