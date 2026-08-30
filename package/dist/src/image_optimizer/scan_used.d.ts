import type { ImageOverrideOptions } from "./types.js";
export declare const CODE_EXTENSIONS: readonly string[];
export declare const IGNORED_DIRS: ReadonlySet<string>;
export declare function findCodeFiles(dir: string, found?: string[]): Promise<string[]>;
export declare function extractImageReferences(code: string): string[];
export declare function extractImageOverrides(code: string): Record<string, ImageOverrideOptions>;
export declare function collectUsedImageOverrides(root: string, publicDir?: string): Promise<Record<string, ImageOverrideOptions>>;
export declare function collectUsedImages(root: string, publicDir?: string): Promise<string[]>;
