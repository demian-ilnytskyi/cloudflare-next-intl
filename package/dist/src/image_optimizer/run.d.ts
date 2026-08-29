import type { OptimizedImage, ResolvedOptions } from "./types.js";
export declare function collectImages(dirs: string[], root: string): Promise<string[]>;
export declare function run(root: string, options: ResolvedOptions, cacheFile?: string): Promise<OptimizedImage[]>;
