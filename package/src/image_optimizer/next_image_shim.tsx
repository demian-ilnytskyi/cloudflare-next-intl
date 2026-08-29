import React from "react";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import type { ImageProps } from "next/image";
import manifest from "virtual:cloudflare-next-intl-images-manifest";
import { getImageBlurSvg } from "./blur_svg.js";
import type { OptimizedImage } from "./types.js";

export type ManifestEntry = OptimizedImage;

const manifestData = manifest as { images?: Record<string, ManifestEntry> } | undefined;
const images: Record<string, ManifestEntry> = (manifestData && typeof manifestData === "object" && manifestData.images)
    ? manifestData.images
    : {};

function resolveProps(props: ImageProps): ImageProps {
    let src = props.src;
    let blurDataURL = props.blurDataURL;
    let width = props.width;
    let height = props.height;

    if (typeof src === "string") {
        const entry = images[src];
        if (entry) {
            if (entry.src) src = entry.src;
            if (!blurDataURL && props.placeholder === "blur" && entry.blurDataURL) {
                blurDataURL = getImageBlurSvg(
                    entry.blurDataURL,
                    entry.blurWidth,
                    entry.blurHeight,
                    (props.style as React.CSSProperties | undefined)?.objectFit,
                );
            }
            if (!width && !props.fill && entry.width) {
                width = entry.width;
                height = entry.height;
            }
        }
    }
    return { ...props, src, blurDataURL, width, height };
}

export default function Image(props: ImageProps): React.JSX.Element {
    const resolved = resolveProps(props);
    return <NextImage {...resolved} />;
}

export function getImageProps(props: ImageProps): ReturnType<typeof nextGetImageProps> {
    const resolved = resolveProps(props);
    return nextGetImageProps(resolved);
}

export { getImageBlurSvg };
