import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ResolvedConfig } from "vite";
import { run } from "./run.js";
import { resolveOptions } from "./types.js";
import type { ImageOptimizerPluginOptions } from "./types.js";
import {
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
    detectImageLoader,
    generateLoaderVirtualModule,
} from "./detect_loader.js";
import { transformMetadataImageUrls } from "./metadata_transform.js";
import { pruneBuildOutput } from "./prune_build.js";
import { classifyImageUsages, collectUnusedImages, getPrunableOriginalPaths } from "./scan_used.js";

export const VIRTUAL_IMAGE_SHIM_ID = "virtual:cloudflare-next-intl-image";
export const VIRTUAL_MANIFEST_ID = "virtual:cloudflare-next-intl-images-manifest";
const RESOLVED_MANIFEST_ID = "\0" + VIRTUAL_MANIFEST_ID;

const sharedPrunableByRoot = new Map<string, string[]>();
const sharedManifestByRoot = new Map<string, Record<string, { src: string }>>();

const SHIM_FILE_RE = /[\\/]image_optimizer[\\/]next_image_shim\.(?:js|tsx)$/;
const CLIENT_FILE_RE = /[\\/]image_optimizer[\\/]next_image_client\.(?:js|tsx)$/;

/**
 * The shim and client read the manifest and the auto-detected loader through
 * `import()` so they still load where no plugin answers the virtual ids (a
 * consumer's own vitest run). Under this plugin the virtual modules always
 * resolve, so a static import is added and applied while the module evaluates:
 * otherwise the first render — a client component mounting right after its
 * chunk loads — runs before the `import()` settles and gets the original src.
 */
export function injectSyncVirtualImports(code: string, id: string): string | undefined {
    const file = id.split("?")[0];
    if (SHIM_FILE_RE.test(file)) {
        if (!code.includes("applyManifestModule") || !code.includes("applyLoaderModule")) return undefined;
        return `${code}
import * as __cfniManifestModule from "${VIRTUAL_MANIFEST_ID}";
import * as __cfniLoaderModule from "${VIRTUAL_IMAGE_LOADER_ID}";
applyManifestModule(__cfniManifestModule);
applyLoaderModule(__cfniLoaderModule);
`;
    }
    if (CLIENT_FILE_RE.test(file)) {
        if (!code.includes("applyLoaderModule")) return undefined;
        return `${code}
import * as __cfniLoaderModule from "${VIRTUAL_IMAGE_LOADER_ID}";
applyLoaderModule(__cfniLoaderModule);
`;
    }
    return undefined;
}

const CDN_CGI_IMAGE_RE = /^\/cdn-cgi\/image\/[^/]+\/(?!https?:|\/)(.+)$/;

/**
 * Cloudflare Image Transformations (`/cdn-cgi/image/<options>/<path>`, what a
 * Cloudflare `next/image` loader returns) only exist on a Cloudflare zone. On a
 * local dev or preview server the request 404s, so serve the source asset as is.
 */
export function rewriteCdnCgiImage(req: { url?: string; originalUrl?: string }): void {
    const match = req.url ? CDN_CGI_IMAGE_RE.exec(req.url) : null;
    if (!match) return;
    req.url = `/${match[1]}`;
    if (req.originalUrl !== undefined) req.originalUrl = req.url;
}

export function getShimPath(
    dir: string = path.dirname(fileURLToPath(import.meta.url)),
): string {
    const jsPath = path.join(dir, "next_image_shim.js");
    if (existsSync(jsPath)) return jsPath;
    return path.join(dir, "next_image_shim.tsx");
}

export function imageOptimizerPlugin(
    options?: ImageOptimizerPluginOptions,
): Plugin {
    const resolved = resolveOptions(options);
    let command: "build" | "serve" = "build";
    let viteConfig: ResolvedConfig | undefined;

    return {
        name: "cloudflare-next-intl-image-optimizer",
        enforce: "pre",
        // `resolveId`/`load` (below) always run, in dev too — `next_image_shim.tsx`
        // unconditionally imports `virtual:cloudflare-next-intl-images-manifest`
        // at module load time regardless of dev/build, so if this whole plugin
        // were dev-disabled (as it used to be via `apply: resolved.dev ? undefined
        // : "build"`), Vite would have no `resolveId`/`load` hook to answer that
        // import in dev and every page importing `next/image` would 500 with
        // "Failed to resolve import ... Does the file exist?". Only `buildStart`'s
        // actual optimizer SCAN (downscaling, format conversion) stays build-only
        // (or dev-only-when-opted-in via `resolved.dev`, checked against the real
        // Vite command captured below rather than `NODE_ENV`, which a project can
        // set independently of which Vite command is actually running) — the
        // virtual module resolution needs to answer unconditionally so dev gets
        // the same clean "no manifest yet" fallback the shim already handles.
        configResolved(config): void {
            viteConfig = config;
            command = config.command === "serve" ? "serve" : "build";
        },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url && (req.url.startsWith("/_next/image") || req.url.startsWith("/_vinext/image"))) {
                    try {
                        const parsed = new URL(req.url, "http://localhost:3000");
                        const targetUrl = parsed.searchParams.get("url");
                        if (targetUrl) {
                            req.url = targetUrl;
                            return next();
                        }
                    } catch {
                        // ignore and fall through
                    }
                }
                rewriteCdnCgiImage(req);
                next();
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use((req, _res, next) => {
                rewriteCdnCgiImage(req);
                next();
            });
        },
        resolveId(id: string): string | undefined {
            if (id === VIRTUAL_IMAGE_SHIM_ID) {
                return getShimPath();
            }
            if (id === VIRTUAL_MANIFEST_ID) {
                return RESOLVED_MANIFEST_ID;
            }
            if (id === VIRTUAL_IMAGE_LOADER_ID) {
                return RESOLVED_IMAGE_LOADER_ID;
            }
            return undefined;
        },
        load(id: string): string | undefined {
            if (id === RESOLVED_MANIFEST_ID) {
                const manifestPath = path.resolve(process.cwd(), resolved.manifest);
                if (existsSync(manifestPath)) {
                    const content = readFileSync(manifestPath, "utf8");
                    return `export default ${content};`;
                }
                return `export default { images: {} };`;
            }
            if (id === RESOLVED_IMAGE_LOADER_ID) {
                if (resolved.autoImageLoader === false) {
                    return `export const defaultLoader = undefined;\nexport const hasCustomLoader = false;\nexport default undefined;\n`;
                }
                const loaderOptions = typeof resolved.autoImageLoader === "object" ? resolved.autoImageLoader : undefined;
                const detected = detectImageLoader(loaderOptions);
                return generateLoaderVirtualModule(detected);
            }
            return undefined;
        },
        transform(code: string, id: string): { code: string; map: null } | undefined {
            const injected = injectSyncVirtualImports(code, id);
            if (injected !== undefined) return { code: injected, map: null };
            if (!resolved.enabled) return undefined;
            if (id.includes("node_modules")) return undefined;
            if (id === getShimPath()) return undefined;

            let transformedCode = code;
            const root = process.cwd();
            const activeManifest = sharedManifestByRoot.get(root);

            if ((command === "build" || resolved.dev) && resolved.optimizeMetadata && activeManifest && Object.keys(activeManifest).length > 0) {
                const metaReplaced = transformMetadataImageUrls(transformedCode, activeManifest);
                if (metaReplaced !== undefined) {
                    transformedCode = metaReplaced;
                }
            }

            if (/from\s*["']next\/image["']/.test(transformedCode)) {
                transformedCode = transformedCode.replace(
                    /(import\s+(?!type\s)[^;]*?from\s*)(["'])next\/image\2/g,
                    `$1$2${VIRTUAL_IMAGE_SHIM_ID}$2`,
                );
            }

            return transformedCode === code ? undefined : { code: transformedCode, map: null };
        },
        async buildStart(): Promise<void> {
            if (!resolved.enabled) return;
            const root = process.cwd();
            const manifestPath = path.resolve(root, resolved.manifest);

            if (existsSync(manifestPath)) {
                try {
                    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
                    if (parsed?.images && typeof parsed.images === "object") {
                        sharedManifestByRoot.set(root, parsed.images);
                    }
                } catch {
                    // Ignore parse error, will be overwritten by run()
                }
            }

            if (command === "serve" && !resolved.dev) return;

            const cacheFile = path.resolve(root, resolved.cacheDir, "manifest.json");
            const entries = await run(root, resolved, cacheFile);

            const manifestImages: Record<string, { src: string }> = {};
            for (const entry of entries) {
                manifestImages[entry.originalSrc] = { src: entry.src };
            }
            sharedManifestByRoot.set(root, manifestImages);

            this.info?.(`[cloudflare-next-intl] image-optimizer: ${entries.length} images in ${resolved.manifest}`);

            if (command === "build" && (resolved.pruneOriginalsFromBuild || resolved.pruneUnusedFromBuild)) {
                const prunable = new Set<string>();
                if (resolved.pruneOriginalsFromBuild) {
                    const classifications = await classifyImageUsages(root, "public");
                    for (const rel of getPrunableOriginalPaths(classifications, manifestImages, resolved.optimizeMetadata)) {
                        prunable.add(rel);
                    }
                }
                if (resolved.pruneUnusedFromBuild) {
                    for (const rel of await collectUnusedImages(root, resolved.dirs, "public")) {
                        prunable.add(rel);
                    }
                }
                sharedPrunableByRoot.set(root, [...prunable].sort());
            }
        },
        closeBundle(): void {
            if (command !== "build" || !resolved.enabled || !(resolved.pruneOriginalsFromBuild || resolved.pruneUnusedFromBuild)) return;
            const root = process.cwd();
            const prunable = sharedPrunableByRoot.get(root);
            if (!prunable || prunable.length === 0) return;

            // Only prune client-facing asset output directories, never server or root dist dirs
            const outDirs = new Set<string>();

            const clientDir = path.resolve(root, "dist/client");
            if (existsSync(clientDir)) {
                outDirs.add(clientDir);
            }

            if (viteConfig?.build?.outDir) {
                const outDir = path.resolve(root, viteConfig.build.outDir);
                if (!outDir.endsWith("server") && !outDir.endsWith("dist") && existsSync(outDir)) {
                    outDirs.add(outDir);
                }
            }

            if (outDirs.size === 0) return;

            const { prunedFiles, bytesSaved } = pruneBuildOutput(Array.from(outDirs), prunable);
            if (prunedFiles.length > 0) {
                const mb = (bytesSaved / (1024 * 1024)).toFixed(2);
                const kb = (bytesSaved / 1024).toFixed(1);
                const sizeStr = bytesSaved >= 1024 * 1024 ? `${mb} MB` : `${kb} kB`;
                this.info?.(`[cloudflare-next-intl] image-optimizer: pruned ${prunedFiles.length} unoptimized or unused images from build output (${sizeStr} saved)`);
            }
        },
    };
}

export const imageOptimizer = imageOptimizerPlugin;
export default imageOptimizerPlugin;
