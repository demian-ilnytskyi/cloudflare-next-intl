import type { Plugin } from "vite";
import { type LocaleFilePluginOptions } from "./locale_file_plugin.js";
import { type ImageOptimizerPluginOptions } from "../image_optimizer/index.js";
import { type AutoDynamicPagesPluginOptions } from "./auto_dynamic_pages_plugin.js";
import { type AutoLocaleParamsPluginOptions } from "./auto_locale_params_plugin.js";
import { type LayoutQueriesPluginOptions } from "./layout_queries_plugin.js";
import { type FirebaseAuthCheckPluginOptions } from "./firebase_auth_check_plugin.js";
import { type VinextRouteWiringFixPluginOptions } from "./vinext_route_wiring_fix.js";
import { type LucideOptimizerPluginOptions } from "./lucide_optimizer_plugin.js";
export interface CloudflareNextIntlOptions extends LocaleFilePluginOptions {
    lucideOptimizer?: boolean | LucideOptimizerPluginOptions;
    autoDynamicPages?: boolean | AutoDynamicPagesPluginOptions;
    buildIdAsset?: boolean | string;
    localeFiles?: boolean;
    userAgentStub?: boolean;
    cfWorkersClientStub?: boolean;
    imageOptimizer?: boolean | ImageOptimizerPluginOptions;
    vinextRouteWiringFix?: boolean | VinextRouteWiringFixPluginOptions;
    autoLocaleParams?: boolean | AutoLocaleParamsPluginOptions;
    layoutQueriesCheck?: boolean | LayoutQueriesPluginOptions;
    firebaseAuthCheck?: boolean | FirebaseAuthCheckPluginOptions;
    experimentalRouteLoadingFixes?: boolean;
}
export declare function cloudflareNextIntl(options?: CloudflareNextIntlOptions): Plugin[];
export declare const cloudflareNextIntlPlugin: typeof cloudflareNextIntl;
export default cloudflareNextIntl;
