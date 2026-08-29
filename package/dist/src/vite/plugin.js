import { buildIdAsset } from "./build_id_asset.js";
import { userAgentStubPlugin } from "./user_agent_stub.js";
import { cfWorkersClientStubPlugin } from "./cf_workers_client_stub.js";
import { localeFilePlugin } from "./locale_file_plugin.js";
export function cloudflareNextIntl(options = {}) {
    const plugins = [];
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
