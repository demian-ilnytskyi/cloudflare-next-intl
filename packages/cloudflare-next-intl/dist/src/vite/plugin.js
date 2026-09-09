import { buildIdAsset } from "./build_id_asset.js";
import { userAgentStubPlugin } from "./user_agent_stub.js";
import { cfWorkersClientStubPlugin } from "./cf_workers_client_stub.js";
import { localeFilePlugin } from "./locale_file_plugin.js";
import { imageOptimizerPlugin } from "../image_optimizer/index.js";
import { autoDynamicPagesPlugin } from "./auto_dynamic_pages_plugin.js";
import { autoLocaleParamsPlugin } from "./auto_locale_params_plugin.js";
import { layoutQueriesPlugin } from "./layout_queries_plugin.js";
import { firebaseAuthCheckPlugin } from "./firebase_auth_check_plugin.js";
import { vinextRouteWiringFixPlugin } from "./vinext_route_wiring_fix.js";
import { lucideOptimizerPlugin } from "./lucide_optimizer_plugin.js";
export function cloudflareNextIntl(options = {}) {
    const plugins = [];
    if (options.layoutQueriesCheck !== false) {
        plugins.push(layoutQueriesPlugin(typeof options.layoutQueriesCheck === "object"
            ? options.layoutQueriesCheck
            : undefined));
    }
    if (options.firebaseAuthCheck !== false) {
        plugins.push(firebaseAuthCheckPlugin(typeof options.firebaseAuthCheck === "object"
            ? options.firebaseAuthCheck
            : { intlConfigPath: options.intlConfigPath }));
    }
    if (options.lucideOptimizer !== false) {
        plugins.push(lucideOptimizerPlugin(typeof options.lucideOptimizer === "object"
            ? options.lucideOptimizer
            : { root: options.root }));
    }
    const enableRouteLoadingFixes = options.experimentalRouteLoadingFixes !== false;
    const shouldEnableVinextFix = options.vinextRouteWiringFix !== undefined
        ? Boolean(options.vinextRouteWiringFix)
        : enableRouteLoadingFixes;
    if (shouldEnableVinextFix) {
        plugins.push(vinextRouteWiringFixPlugin(typeof options.vinextRouteWiringFix === "object" ? options.vinextRouteWiringFix : {}));
    }
    if (options.autoLocaleParams !== false) {
        plugins.push(autoLocaleParamsPlugin(typeof options.autoLocaleParams === "object"
            ? options.autoLocaleParams
            : undefined));
    }
    if (options.autoDynamicPages !== false) {
        const autoDynamicPagesOptions = typeof options.autoDynamicPages === "object" ? { ...options.autoDynamicPages } : {};
        if (enableRouteLoadingFixes && autoDynamicPagesOptions.includeLoading === undefined) {
            autoDynamicPagesOptions.includeLoading = true;
        }
        plugins.push(autoDynamicPagesPlugin(autoDynamicPagesOptions));
    }
    if (options.imageOptimizer !== false) {
        plugins.push(imageOptimizerPlugin(typeof options.imageOptimizer === "object"
            ? options.imageOptimizer
            : undefined));
    }
    if (options.buildIdAsset !== false) {
        const fileName = typeof options.buildIdAsset === "string" ? options.buildIdAsset : "BUILD_ID";
        plugins.push(buildIdAsset(fileName));
    }
    if (options.cfWorkersClientStub !== false) {
        plugins.push(cfWorkersClientStubPlugin());
    }
    if (options.userAgentStub !== false) {
        plugins.push(userAgentStubPlugin());
    }
    if (options.localeFiles !== false) {
        plugins.push(localeFilePlugin({
            messagesDir: options.messagesDir,
            intlConfigPath: options.intlConfigPath,
            root: options.root,
        }));
    }
    return plugins;
}
export const cloudflareNextIntlPlugin = cloudflareNextIntl;
export default cloudflareNextIntl;
