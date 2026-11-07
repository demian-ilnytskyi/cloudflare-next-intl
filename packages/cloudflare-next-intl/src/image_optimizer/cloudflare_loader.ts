export interface CloudflareImageLoaderOptions {
    /**
     * Smallest width requested from Cloudflare Image Transformations. Narrower
     * images are requested at this width, so small icons share a few cached sizes.
     * @default 160
     */
    minWidth?: number;
    /**
     * Return the original `src` untouched in development (`NODE_ENV === "development"`)
     * or when `NEXT_PUBLIC_LOCAL` is set, where `/cdn-cgi/image` does not exist.
     * @default true
     */
    localPassthrough?: boolean;
}

export interface CloudflareImageLoaderParams {
    src: string;
    width?: number;
    quality?: number;
}

export const DEFAULT_CLOUDFLARE_MIN_WIDTH = 160;

// Written out in full so bundlers can replace `process.env.*` at build time; the
// try/catch covers a browser bundle where `process` was left undefined.
function isLocal(): boolean {
    try {
        return process.env.NODE_ENV === "development" || Boolean(process.env.NEXT_PUBLIC_LOCAL);
    } catch {
        return false;
    }
}

/**
 * Builds a `next/image` loader for Cloudflare Image Transformations
 * (`/cdn-cgi/image/<options>/<path>`). Use it as the default export of the file
 * set in `images.loaderFile`:
 *
 * ```ts
 * import { createCloudflareImageLoader } from "cloudflare-next-intl/image-loader";
 * export default createCloudflareImageLoader({ minWidth: 160 });
 * ```
 */
export function createCloudflareImageLoader(
    options: CloudflareImageLoaderOptions = {},
): (params: CloudflareImageLoaderParams) => string {
    const minWidth = options.minWidth ?? DEFAULT_CLOUDFLARE_MIN_WIDTH;
    const localPassthrough = options.localPassthrough ?? true;

    return function cloudflareLoader({ src, width, quality }: CloudflareImageLoaderParams): string {
        if (localPassthrough && isLocal()) return src;
        const params = [`width=${width ? Math.max(width, minWidth) : "auto"}`, "format=auto"];
        if (quality) params.push(`quality=${quality}`);
        return `/cdn-cgi/image/${params.join(",")}/${src.startsWith("/") ? src.slice(1) : src}`;
    };
}

export default createCloudflareImageLoader;
