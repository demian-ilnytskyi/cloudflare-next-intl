declare module "virtual:cloudflare-next-intl-images-manifest" {
    import type { OptimizedImage } from "./types.js";
    const manifest: { images?: Record<string, OptimizedImage> } | Record<string, OptimizedImage>;
    export default manifest;
}
