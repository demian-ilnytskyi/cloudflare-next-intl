export {
    imageOptimizerPlugin,
    imageOptimizer,
    VIRTUAL_IMAGE_SHIM_ID,
    VIRTUAL_MANIFEST_ID,
    getShimPath,
    rewriteCdnCgiImage,
    injectSyncVirtualImports,
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
    collectUnusedImages,
    blankComments,
    UNUSED_CANDIDATE_EXTENSIONS,
    findCodeFiles,
    extractImageReferences,
    extractImageOverrides,
    extractImageUsageDetails,
    classifyImageUsages,
    getPrunableOriginalPaths,
    CODE_EXTENSIONS,
    ASSET_EXTENSIONS,
    SCANNED_EXTENSIONS,
    IGNORED_DIRS,
    IGNORED_FILES,
    type ImageUsageDetails,
    type ImageUsageClassification,
} from "./scan_used.js";

export {
    transformMetadataImageUrls,
    getMetadataRanges,
    findBalancedBraces,
} from "./metadata_transform.js";

export {
    pruneBuildOutput,
    type PruneResult,
} from "./prune_build.js";

export {
    getImageBlurSvg,
} from "./blur_svg.js";

export {
    type ManifestEntry,
} from "./next_image_shim.js";

export {
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
    type AutoImageLoaderOptions,
    type DetectedImageLoader,
    findLoaderFileFromNextConfig,
    findExportedLoaderName,
    detectImageLoader,
    generateLoaderVirtualModule,
} from "./detect_loader.js";

