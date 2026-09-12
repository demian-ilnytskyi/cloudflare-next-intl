import type { Plugin } from "vite";
import { buildIdAsset } from "./build_id_asset.js";
import { userAgentStubPlugin } from "./user_agent_stub.js";
import { cfWorkersClientStubPlugin } from "./cf_workers_client_stub.js";
import { bufferStubPlugin } from "./buffer_stub.js";
import { reactEvalStubPlugin } from "./react_eval_stub.js";
import { localeFilePlugin, type LocaleFilePluginOptions } from "./locale_file_plugin.js";
import { imageOptimizerPlugin, type ImageOptimizerPluginOptions } from "../image_optimizer/index.js";

import { autoDynamicPagesPlugin, type AutoDynamicPagesPluginOptions } from "./auto_dynamic_pages_plugin.js";
import { autoLocaleParamsPlugin, type AutoLocaleParamsPluginOptions } from "./auto_locale_params_plugin.js";
import { layoutQueriesPlugin, type LayoutQueriesPluginOptions } from "./layout_queries_plugin.js";
import { firebaseAuthCheckPlugin, type FirebaseAuthCheckPluginOptions } from "./firebase_auth_check_plugin.js";
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
     * Stubs `node:buffer` in client (browser) builds with the `buffer` polyfill
     * to prevent runtime crashes when vinext server actions access `next/cache`.
     * @default true
     */
    bufferStub?: boolean;

    /**
     * Polyfills `globalThis.eval` and silences the noisy React RSC eval warning in
     * Cloudflare Workers (workerd) development mode.
     * @default true
     */
    reactEvalStub?: boolean;

    /**
     * Build-time and dev image optimizer plugin. Automatically downscales rasters into `public/generated`,
     * emits AVIF / WebP siblings, generates blur placeholders with SVG filters, and injects blurDataURL.
     * Pass an options object to customize or `false` to disable.
     * @default true
     */
    imageOptimizer?: boolean | ImageOptimizerPluginOptions;

    /**
     * Patch Vinext to fix route-wiring, route-matching, and optimistic-routing bugs around
     * nested loading boundaries and leading `:locale` segments. Pass an options object or
     * `true` to enable.
     *
     * ⚠️ Monkey-patches installed vinext files on disk in `node_modules/vinext/dist`.
     * Follows `experimentalRouteLoadingFixes` (on by default) unless set explicitly;
     * set `false` to leave vinext untouched.
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

    /**
     * Scan layout files and their component tree to flag blocking database queries
     * (`withUserDb()`, `withPublicDb()`) that prevent fast client transitions.
     * Enabled by default. Pass an options object to configure or `false` to disable.
     * @default true
     */
    layoutQueriesCheck?: boolean | LayoutQueriesPluginOptions;

    /**
     * Statically validate the `firebaseAuth` block of the `@intl-config`
     * file on `vite dev` and `vite build`: required Firebase fields, and —
     * when `appCheck` is set — the server-side signing credentials
     * (`clientEmail`/`appId` plus `privateKey` or the full OAuth triple).
     * Env-var-backed fields are resolved against `.env*` + `process.env`, so
     * a missing `FIREBASE_SERVICE_ACCOUNT_*` secret is caught before deploy
     * instead of showing up as a signed-out render in production. Fails the
     * build by default; pass `{ strict: false }` to only log the warning.
     * No-op when the config has no `firebaseAuth`.
     * @default true
     */
    firebaseAuthCheck?: boolean | FirebaseAuthCheckPluginOptions;

    /**
     * Unified switcher for route & loading fixes:
     * When enabled, turns on both `vinextRouteWiringFix` (monkey-patching vinext route wiring on disk)
     * and `autoDynamicPages: { includeLoading: true }` (injecting force-static SSG into loading.* files).
     *
     * On by default: without it vinext renders a stale/ancestor `loading.tsx` instead of the
     * target route's own one. Every individual patch is a no-op when the vinext code it targets
     * no longer matches, and `includeLoading` self-disables unless the route-wiring patch verified
     * on disk, so a future vinext release degrades to plain unpatched behaviour rather than breaking.
     * Set `false` to opt out.
     * @default true
     */
    experimentalRouteLoadingFixes?: boolean;
}

export function cloudflareNextIntl(options: CloudflareNextIntlOptions = {}): Plugin[] {
    const plugins: Plugin[] = [];

    if (options.layoutQueriesCheck !== false) {
        plugins.push(
            layoutQueriesPlugin(
                typeof options.layoutQueriesCheck === "object"
                    ? options.layoutQueriesCheck
                    : undefined
            )
        );
    }

    if (options.firebaseAuthCheck !== false) {
        plugins.push(
            firebaseAuthCheckPlugin(
                typeof options.firebaseAuthCheck === "object"
                    ? options.firebaseAuthCheck
                    : { intlConfigPath: options.intlConfigPath }
            )
        );
    }

    if (options.lucideOptimizer !== false) {
        plugins.push(
            lucideOptimizerPlugin(
                typeof options.lucideOptimizer === "object"
                    ? options.lucideOptimizer
                    : { root: options.root }
            )
        );
    }

    const enableRouteLoadingFixes = options.experimentalRouteLoadingFixes !== false;

    const shouldEnableVinextFix = options.vinextRouteWiringFix !== undefined
        ? Boolean(options.vinextRouteWiringFix)
        : enableRouteLoadingFixes;

    if (shouldEnableVinextFix) {
        plugins.push(
            vinextRouteWiringFixPlugin(
                typeof options.vinextRouteWiringFix === "object" ? options.vinextRouteWiringFix : {},
            ),
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
        const autoDynamicPagesOptions: AutoDynamicPagesPluginOptions =
            typeof options.autoDynamicPages === "object" ? { ...options.autoDynamicPages } : {};
        if (enableRouteLoadingFixes && autoDynamicPagesOptions.includeLoading === undefined) {
            autoDynamicPagesOptions.includeLoading = true;
        }
        plugins.push(autoDynamicPagesPlugin(autoDynamicPagesOptions));
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

    if (options.bufferStub !== false) {
        plugins.push(bufferStubPlugin());
    }

    if (options.reactEvalStub !== false) {
        plugins.push(reactEvalStubPlugin());
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
