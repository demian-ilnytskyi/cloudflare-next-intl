import type { Plugin } from "vite";

export const PUBLIC_ASSET_IMPORT_PREFIX = "\0cfni:public-asset:";
export const ASSET_EXTENSIONS = /\.(svg|png|jpg|jpeg|webp|avif|ico|gif|mp4|webm|ogg|mp3|wav|woff|woff2|ttf|eot)$/i;

export function publicAssetImportPlugin(): Plugin {
    return {
        name: "cfni:public-asset-import",
        enforce: "pre",
        resolveId(id) {
            if (id.includes("/public/") && ASSET_EXTENSIONS.test(id)) {
                const idx = id.lastIndexOf("/public/");
                const rootPath = id.slice(idx + "/public".length);
                return `${PUBLIC_ASSET_IMPORT_PREFIX}${rootPath}`;
            }
        },
        load(id) {
            if (id.startsWith(PUBLIC_ASSET_IMPORT_PREFIX)) {
                const rootPath = id.slice(PUBLIC_ASSET_IMPORT_PREFIX.length);
                return `export default ${JSON.stringify(rootPath)};`;
            }
        },
    };
}

