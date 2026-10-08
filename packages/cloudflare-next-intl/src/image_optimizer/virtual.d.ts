declare module "virtual:cloudflare-next-intl-images-manifest" {
    import type { OptimizedImage } from "./types.js";
    const manifest: { images?: Record<string, OptimizedImage> } | Record<string, OptimizedImage>;
    export default manifest;
}

declare module "virtual:cloudflare-next-intl-image-loader" {
    export type CustomImageLoaderFn = (props: { src: string; width: number; quality?: number }) => string;
    export const defaultLoader: CustomImageLoaderFn | undefined;
    export const hasCustomLoader: boolean;
    const loader: CustomImageLoaderFn | undefined;
    export default loader;
}

