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

function findEntry(srcVal: unknown): ManifestEntry | undefined {
    if (!srcVal) return undefined;
    const raw = typeof srcVal === "string"
        ? srcVal
        : (typeof srcVal === "object" && srcVal !== null && "src" in srcVal)
            ? String((srcVal as { src: unknown }).src)
            : String(srcVal);

    if (images[raw]) return images[raw];

    const withoutPublic = raw.replace(/^\/?public/, "");
    if (images[withoutPublic]) return images[withoutPublic];

    const withSlash = withoutPublic.startsWith("/") ? withoutPublic : "/" + withoutPublic;
    if (images[withSlash]) return images[withSlash];

    const clean = withSlash.split("?")[0].split("#")[0];
    if (images[clean]) return images[clean];

    for (const [key, entry] of Object.entries(images)) {
        const filename = key.split("/").pop();
        if (filename && (clean.endsWith("/" + filename) || clean.includes(filename.split(".")[0]))) {
            return entry;
        }
    }
    return undefined;
}

function resolveProps(props: ImageProps): ImageProps {
    let src = props.src;
    let blurDataURL = props.blurDataURL;
    let width = props.width;
    let height = props.height;
    let style = props.style;

    const entry = findEntry(src);
    if (entry) {
        if (entry.src) {
            if (typeof src === "string") {
                src = entry.src;
            } else if (typeof src === "object" && src !== null && "src" in src) {
                src = { ...src, src: entry.src };
            } else {
                src = entry.src;
            }
        }
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

    if (props.placeholder === "blur" && blurDataURL) {
        const objectFit = (props.style as React.CSSProperties | undefined)?.objectFit || (props.className?.includes("object-contain") ? "contain" : "cover");
        style = {
            backgroundSize: objectFit,
            backgroundPosition: "50% 50%",
            backgroundRepeat: "no-repeat",
            backgroundImage: `url("${blurDataURL}")`,
            ...style,
        };
    }

    return { ...props, src, blurDataURL, width, height, style };
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
