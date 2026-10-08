import type { Plugin } from "vite";
import { getShimPath, VIRTUAL_IMAGE_SHIM_ID } from "../image_optimizer/plugin.js";
import {
    NEXT_CONFIG_CANDIDATES,
    DEFAULT_LOADER_CANDIDATES,
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
    type AutoImageLoaderOptions,
    type DetectedImageLoader,
    findLoaderFileFromNextConfig,
    findExportedLoaderName,
    detectImageLoader,
    generateLoaderVirtualModule,
} from "../image_optimizer/detect_loader.js";

export {
    NEXT_CONFIG_CANDIDATES,
    DEFAULT_LOADER_CANDIDATES,
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
    type AutoImageLoaderOptions,
    type DetectedImageLoader,
    findLoaderFileFromNextConfig,
    findExportedLoaderName,
    detectImageLoader,
    generateLoaderVirtualModule,
};

/**
 * Vite plugin that automatically discovers `image-loader.ts` (or custom file) and wires it as default loader
 * for all Next.js Image components under Vinext.
 */
export function autoImageLoaderPlugin(options?: AutoImageLoaderOptions): Plugin {
    const isEnabled = options?.enabled !== false;

    return {
        name: "cloudflare-next-intl-auto-image-loader",
        enforce: "pre",
        resolveId(id: string): string | undefined {
            if (id === VIRTUAL_IMAGE_LOADER_ID) {
                return RESOLVED_IMAGE_LOADER_ID;
            }
            if (id === VIRTUAL_IMAGE_SHIM_ID) {
                return getShimPath();
            }
            return undefined;
        },
        load(id: string): string | undefined {
            if (id === RESOLVED_IMAGE_LOADER_ID) {
                if (!isEnabled) {
                    return `export const defaultLoader = undefined;\nexport const hasCustomLoader = false;\nexport default undefined;\n`;
                }
                const detected = detectImageLoader(options);
                return generateLoaderVirtualModule(detected);
            }
            return undefined;
        },
        transform(code: string, id: string): { code: string; map: null } | undefined {
            if (!isEnabled) return undefined;
            if (id.includes("node_modules")) return undefined;
            if (id === getShimPath()) return undefined;
            if (!/from\s*["']next\/image["']/.test(code)) return undefined;

            const next = code.replace(
                /(import\s+(?!type\s)[^;]*?from\s*)(["'])next\/image\2/g,
                `$1$2${VIRTUAL_IMAGE_SHIM_ID}$2`,
            );
            return next === code ? undefined : { code: next, map: null };
        },
    };
}

export default autoImageLoaderPlugin;
