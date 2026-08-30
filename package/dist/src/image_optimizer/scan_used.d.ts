import type { ImageOverrideOptions } from "./types.js";
export declare const CODE_EXTENSIONS: readonly string[];
export declare const IGNORED_DIRS: ReadonlySet<string>;
export declare function findCodeFiles(dir: string, found?: string[]): Promise<string[]>;
export declare function extractImageReferences(code: string): string[];
/**
 * Scans JSX/TSX source for <Image> tags carrying per-image optimizer props
 * (formats / blur / quality / maxWidth) and turns them into override entries
 * keyed by the tag's own src, so settings can live next to usage instead of
 * only in the plugin's centralized `overrides` config. Every tag's own
 * `width` prop is also collected into `extraWidths`, merged across all usages
 * of the same src, so the same image used at different sizes (a thumbnail and
 * a hero, say) gets a separate generated variant for each size instead of one
 * usage's width silently overwriting another's.
 */
export declare function extractImageOverrides(code: string): Record<string, ImageOverrideOptions>;
/**
 * Scans project source for <Image> tags with per-image optimizer props
 * (formats / blur / quality / maxWidth) and returns them keyed by public src,
 * in the same shape as the plugin's `overrides` config option.
 */
export declare function collectUsedImageOverrides(root: string, publicDir?: string): Promise<Record<string, ImageOverrideOptions>>;
export declare function collectUsedImages(root: string, publicDir?: string): Promise<string[]>;
