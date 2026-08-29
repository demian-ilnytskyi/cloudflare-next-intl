import type { Plugin } from "vite";
import { buildIdAsset } from "./build_id_asset.js";
import { userAgentStubPlugin } from "./user_agent_stub.js";
import { cfWorkersClientStubPlugin } from "./cf_workers_client_stub.js";
import { localeFilePlugin, type LocaleFilePluginOptions } from "./locale_file_plugin.js";
import { imageOptimizerPlugin, type ImageOptimizerPluginOptions } from "../image_optimizer/index.js";

export interface CloudflareNextIntlOptions extends LocaleFilePluginOptions {
    /**
     * Emit static `BUILD_ID` asset on client build for Vinext / Cloudflare.
     * Set to `false` to disable or pass a custom filename string.
     * @default true ("BUILD_ID")
     */
    buildIdAsset?: boolean | string;

    /**
     * Enable `@locale-file/*` resolution, `@intl-config` alias, RSC re-exports,
     * and eager glob bundling for messages (`import.meta.glob('/messages/*.json', { eager: true })`).
     * @default true
     */
    localeFiles?: boolean;

    /**
     * Stub `next/dist/server/web/spec-extension/user-agent` to avoid pulling `node:fs` into Cloudflare Workers runtime.
     * @default true
     */
    userAgentStub?: boolean;

    /**
     * Stub `cloudflare:workers` on client / non-SSR builds to prevent client bundling errors.
     * @default true
     */
    cfWorkersClientStub?: boolean;

    /**
     * Build-time and dev image optimizer plugin. Automatically downscales rasters into `public/generated`,
     * emits AVIF / WebP siblings, generates blur placeholders with SVG filters, and injects blurDataURL.
     * Pass an options object to customize or `false` to disable.
     * @default true
     */
    imageOptimizer?: boolean | ImageOptimizerPluginOptions;
}

export function cloudflareNextIntl(options: CloudflareNextIntlOptions = {}): Plugin[] {
    const plugins: Plugin[] = [];

    if (options.imageOptimizer !== false) {
        plugins.push(
            imageOptimizerPlugin(
                typeof options.imageOptimizer === "object"
                    ? options.imageOptimizer
                    : undefined
            )
        );
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
        plugins.push(
            localeFilePlugin({
                messagesDir: options.messagesDir,
                intlConfigPath: options.intlConfigPath,
                root: options.root,
            })
        );
    }

    return plugins;
}

export const cloudflareNextIntlPlugin = cloudflareNextIntl;
export default cloudflareNextIntl;
