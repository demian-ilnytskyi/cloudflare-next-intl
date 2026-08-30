import React from "react";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import type { ImageProps } from "next/image";
import manifest from "virtual:cloudflare-next-intl-images-manifest";
import { getImageBlurSvg } from "./blur_svg.js";
import type { OptimizedImage, OptimizedImageVariant } from "./types.js";

export type ManifestEntry = OptimizedImage;

/**
 * When an image was generated at multiple widths (because it's used at
 * different sizes across the codebase), picks the variant whose width is
 * closest to what this particular <Image> usage requested — preferring the
 * smallest variant that is still >= the requested width, to avoid upscaling
 * visible blur, and falling back to the largest available otherwise.
 */
function pickVariant(entry: ManifestEntry, requestedWidth: number | undefined): OptimizedImageVariant {
    if (!requestedWidth || !entry.variants || entry.variants.length === 0) {
        return entry;
    }
    const atLeast = entry.variants.filter((v) => v.width >= requestedWidth);
    if (atLeast.length > 0) {
        return atLeast.reduce((best, v) => (v.width < best.width ? v : best));
    }
    return entry.variants.reduce((best, v) => (v.width > best.width ? v : best));
}

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

/** Swap the format extension of every URL in a generated srcset. */
function retargetSrcSet(srcSet: string, fromSrc: string, toSrc: string): string {
    if (!srcSet) return srcSet;
    const fromEncoded = encodeURIComponent(fromSrc);
    const toEncoded = encodeURIComponent(toSrc);
    return srcSet
        .split(fromEncoded).join(toEncoded)
        .split(fromSrc).join(toSrc);
}

function resolveProps(props: ImageProps): ImageProps {
    let src = props.src;
    let blurDataURL = props.blurDataURL;
    let width = props.width;
    let height = props.height;
    let style = props.style;

    const entry = findEntry(src);
    if (entry) {
        const variant = pickVariant(entry, typeof props.width === "number" ? props.width : undefined);
        if (variant.src) {
            if (typeof src === "string") {
                src = variant.src;
            } else if (typeof src === "object" && src !== null && "src" in src) {
                src = { ...src, src: variant.src };
            } else {
                src = variant.src;
            }
        }
        if (!blurDataURL && props.placeholder === "blur" && variant.blurDataURL) {
            blurDataURL = getImageBlurSvg(
                variant.blurDataURL,
                variant.blurWidth,
                variant.blurHeight,
                (props.style as React.CSSProperties | undefined)?.objectFit,
            );
        }
        if (!width && !props.fill && variant.width) {
            width = variant.width;
            height = variant.height;
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
    const entry = findEntry(props.src);
    const variant = entry
        ? pickVariant(entry, typeof props.width === "number" ? props.width : undefined)
        : undefined;
    const alternates = (variant?.sources ?? []).filter((source) => source.src !== variant?.src);

    if (alternates.length === 0) {
        return <NextImage {...resolved} />;
    }

    const { props: imgProps } = nextGetImageProps(resolved);
    const primarySrc = variant?.src ?? String(imgProps.src);
    const originalSrc = entry?.originalSrc;

    const onError: React.ReactEventHandler<HTMLImageElement> = (event) => {
        const img = event.currentTarget;
        if (originalSrc && img.src !== originalSrc && !img.src.endsWith(originalSrc)) {
            img.srcset = "";
            img.src = originalSrc;
        }
    };

    return (
        <picture>
            {alternates.map((source) => (
                <source
                    key={source.src}
                    type={source.type}
                    sizes={imgProps.sizes}
                    srcSet={
                        imgProps.srcSet
                            ? retargetSrcSet(imgProps.srcSet, primarySrc, source.src)
                            : source.src
                    }
                />
            ))}
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img {...imgProps} onError={onError} />
        </picture>
    );
}

export function getImageProps(props: ImageProps): ReturnType<typeof nextGetImageProps> {
    const resolved = resolveProps(props);
    return nextGetImageProps(resolved);
}

export { getImageBlurSvg };
