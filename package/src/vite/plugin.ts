import type { Plugin } from "vite";
import { buildIdAsset } from "./build_id_asset.js";
import { userAgentStubPlugin } from "./user_agent_stub.js";
import { cfWorkersClientStubPlugin } from "./cf_workers_client_stub.js";
import { localeFilePlugin, type LocaleFilePluginOptions } from "./locale_file_plugin.js";
import { imageOptimizerPlugin, type ImageOptimizerPluginOptions } from "../image_optimizer/index.js";

import { autoDynamicPagesPlugin, type AutoDynamicPagesPluginOptions } from "./auto_dynamic_pages_plugin.js";
import { autoLocaleParamsPlugin, type AutoLocaleParamsPluginOptions } from "./auto_locale_params_plugin.js";
import { vinextRouteWiringFixPlugin, type VinextRouteWiringFixPluginOptions } from "./vinext_route_wiring_fix.js";
import { lucideOptimizerPlugin, type LucideOptimizerPluginOptions } from "./lucide_optimizer_plugin.js";

export interface CloudflareNextIntlOptions extends LocaleFilePluginOptions {
    /**
     * Automatically optimize `lucide-react` by rewriting icon imports to direct deep module paths,
     * preventing network resource exhaustion (net::ERR_INSUFFICIENT_RESOURCES) from ~1750 icon requests in dev,
     * and normalize Next.js .js import specifiers to prevent mid-session re-optimizations.
     * Auto-enabled if `lucide-react` is detected in the project. Set `false` to disable.
     * @default true
     */
    lucideOptimizer?: boolean | LucideOptimizerPluginOptions;

    /**
     * Automatically run `checkDynamicPages({ mode: 'fix', target: 'vinext' })` during Vite setup
     * to insert `export const dynamic = "force-static"` for static SSG pages.
     * Pass an options object or set `false` to disable.
     * @default true
     */
    autoDynamicPages?: boolean | AutoDynamicPagesPluginOptions;

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

    /**
     * Patch Vinext to fix route-wiring, route-matching, and optimistic-routing bugs around
     * nested loading boundaries and leading `:locale` segments. Pass an options object to
     * disable individual parts, or `false` to disable all of them.
     * @default true
     */
    vinextRouteWiringFix?: boolean | VinextRouteWiringFixPluginOptions;

    /**
     * Automatically run `checkLocaleParams({ mode: 'fix' })` during Vite
     * setup to insert the `{ params }: { params: Promise<{ locale: Language }> }`
     * prop and locale resolution (`setLocale`) into `[locale]`-scoped
     * page/layout/loading files that are missing it. Pass an options object
     * or set `false` to disable.
     * @default true
     */
    autoLocaleParams?: boolean | AutoLocaleParamsPluginOptions;
}

export function cloudflareNextIntl(options: CloudflareNextIntlOptions = {}): Plugin[] {
    const plugins: Plugin[] = [];

    if (options.lucideOptimizer !== false) {
        plugins.push(
            lucideOptimizerPlugin(
                typeof options.lucideOptimizer === "object"
                    ? options.lucideOptimizer
                    : { root: options.root }
            )
        );
    }

    // autoLocaleParams runs BEFORE autoDynamicPages: it can insert a
    // `setLocale(locale)` call into a page/layout/loading file that
    // previously had none, which removes the "cookie-derived locale" signal
    // `detectDynamicUsage` would otherwise report for that file's
    // `getTranslations()`/`useTranslations()` call. Scanning for
    // dynamic-API usage AFTER that insertion means a page whose only
    // dynamic signal was the missing locale setup correctly comes out
    // static instead of being flagged dynamic against its own about-to-be-
    // fixed state.
    if (options.autoLocaleParams !== false) {
        plugins.push(
            autoLocaleParamsPlugin(
                typeof options.autoLocaleParams === "object"
                    ? options.autoLocaleParams
                    : undefined
            )
        );
    }

    if (options.autoDynamicPages !== false) {
        plugins.push(
            autoDynamicPagesPlugin(
                typeof options.autoDynamicPages === "object"
                    ? options.autoDynamicPages
                    : undefined
            )
        );
    }

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

    if (options.vinextRouteWiringFix !== false) {
        plugins.push(
            vinextRouteWiringFixPlugin(
                typeof options.vinextRouteWiringFix === "object" ? options.vinextRouteWiringFix : {},
            ),
        );
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
