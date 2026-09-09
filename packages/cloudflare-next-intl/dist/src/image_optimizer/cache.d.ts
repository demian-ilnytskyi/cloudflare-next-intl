import type { OptimizedImage } from "./types.js";
export interface CacheEntry {
    mtimeMs: number;
    size: number;
    result: OptimizedImage;
}
export type CacheData = Record<string, CacheEntry>;
export declare function isFresh(sourcePath: string, cached: CacheEntry | undefined, targets: string[]): Promise<boolean>;
export declare function loadCache(cacheFile: string): Promise<CacheData>;
export declare function saveCache(cacheFile: string, data: CacheData): Promise<void>;
