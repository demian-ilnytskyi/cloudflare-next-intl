import type { Plugin } from "vite";
import { type LocaleFilePluginOptions } from "./locale_file_plugin.js";
import { type ImageOptimizerPluginOptions } from "../image_optimizer/index.js";
export interface CloudflareNextIntlOptions extends LocaleFilePluginOptions {
    buildIdAsset?: boolean | string;
    localeFiles?: boolean;
    userAgentStub?: boolean;
    cfWorkersClientStub?: boolean;
    imageOptimizer?: boolean | ImageOptimizerPluginOptions;
}
export declare function cloudflareNextIntl(options?: CloudflareNextIntlOptions): Plugin[];
export declare const cloudflareNextIntlPlugin: typeof cloudflareNextIntl;
export default cloudflareNextIntl;
