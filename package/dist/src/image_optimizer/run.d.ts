import type { ImageOverrideOptions, OptimizedImage, ResolvedOptions } from "./types.js";
export declare function collectImages(dirs: string[], root: string): Promise<string[]>;
export declare function targetAndSiblingPaths(absolutePath: string, publicRoot: string, options: ResolvedOptions, root: string): string[];
/**
 * Merges optimizer overrides scanned from <Image> JSX props with the plugin's
 * centralized `overrides` config, so settings can live at the usage site. An
 * explicit config override for a given src still wins over a scanned one.
 */
export declare function mergeOverrides(scanned: Record<string, ImageOverrideOptions>, configured: Record<string, ImageOverrideOptions>): Record<string, ImageOverrideOptions>;
export declare function run(root: string, options: ResolvedOptions, cacheFile?: string): Promise<OptimizedImage[]>;
