import type { OptimizedImage } from "./types.js";
export declare function renderManifest(entries: OptimizedImage[]): string;
export declare function writeManifest(manifestPath: string, entries: OptimizedImage[]): Promise<void>;
