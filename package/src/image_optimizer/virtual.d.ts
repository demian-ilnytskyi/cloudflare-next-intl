declare module "virtual:cloudflare-next-intl-images-manifest" {
    const manifest: { images?: Record<string, import("./types.js").OptimizedImage> } | Record<string, import("./types.js").OptimizedImage>;
    export default manifest;
}
