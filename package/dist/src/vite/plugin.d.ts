import type { Plugin } from "vite";
import { type LocaleFilePluginOptions } from "./locale_file_plugin.js";
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
}
export declare function cloudflareNextIntl(options?: CloudflareNextIntlOptions): Plugin[];
export declare const cloudflareNextIntlPlugin: typeof cloudflareNextIntl;
export default cloudflareNextIntl;
