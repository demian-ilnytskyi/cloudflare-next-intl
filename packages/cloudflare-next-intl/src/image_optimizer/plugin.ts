import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { run } from "./run.js";
import { resolveOptions } from "./types.js";
import type { ImageOptimizerPluginOptions } from "./types.js";

export const VIRTUAL_IMAGE_SHIM_ID = "virtual:cloudflare-next-intl-image";
export const VIRTUAL_MANIFEST_ID = "virtual:cloudflare-next-intl-images-manifest";
const RESOLVED_MANIFEST_ID = "\0" + VIRTUAL_MANIFEST_ID;

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
            command = config.command === "serve" ? "serve" : "build";
        },
        resolveId(id: string): string | undefined {
            if (id === VIRTUAL_IMAGE_SHIM_ID) {
                return getShimPath();
            }
            if (id === VIRTUAL_MANIFEST_ID) {
                return RESOLVED_MANIFEST_ID;
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
            return undefined;
        },
        transform(code: string, id: string): { code: string; map: null } | undefined {
            if (!resolved.enabled) return undefined;
            if (id.includes("node_modules")) return undefined;
            if (id === getShimPath()) return undefined;
            if (!/from\s*["']next\/image["']/.test(code)) return undefined;

            const next = code.replace(
                /(import\s+(?!type\s)[^;]*?from\s*)(["'])next\/image\2/g,
                `$1$2${VIRTUAL_IMAGE_SHIM_ID}$2`,
            );
            return next === code ? undefined : { code: next, map: null };
        },
        async buildStart(): Promise<void> {
            if (!resolved.enabled) return;
            if (command === "serve" && !resolved.dev) return;
            const root = process.cwd();
            const cacheFile = path.resolve(root, resolved.cacheDir, "manifest.json");
            const entries = await run(root, resolved, cacheFile);
            this.info?.(`[cloudflare-next-intl] image-optimizer: ${entries.length} images in ${resolved.manifest}`);
        },
    };
}

export const imageOptimizer = imageOptimizerPlugin;
export default imageOptimizerPlugin;
