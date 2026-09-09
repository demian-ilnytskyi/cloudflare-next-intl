import type { ImageOverrideOptions, OptimizedImage, ResolvedOptions } from "./types.js";
export declare function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
export declare function collectImages(dirs: string[], root: string): Promise<string[]>;
export declare function targetAndSiblingPaths(absolutePath: string, publicRoot: string, options: ResolvedOptions, root: string): Promise<string[]>;
export declare function mergeOverrides(scanned: Record<string, ImageOverrideOptions>, configured: Record<string, ImageOverrideOptions>): Record<string, ImageOverrideOptions>;
export declare function run(root: string, options: ResolvedOptions, cacheFile?: string): Promise<OptimizedImage[]>;
