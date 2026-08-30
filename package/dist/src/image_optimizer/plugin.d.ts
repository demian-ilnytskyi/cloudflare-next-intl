import type { Plugin } from "vite";
import type { ImageOptimizerPluginOptions } from "./types.js";
export declare const VIRTUAL_IMAGE_SHIM_ID = "virtual:cloudflare-next-intl-image";
export declare const VIRTUAL_MANIFEST_ID = "virtual:cloudflare-next-intl-images-manifest";
export declare function getShimPath(dir?: string): string;
export declare function imageOptimizerPlugin(options?: ImageOptimizerPluginOptions): Plugin;
export declare const imageOptimizer: typeof imageOptimizerPlugin;
export default imageOptimizerPlugin;
