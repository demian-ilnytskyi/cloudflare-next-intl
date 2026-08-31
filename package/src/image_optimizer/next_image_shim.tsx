import React from "react";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import type { ImageProps } from "next/image";
import { getImageBlurSvg } from "./blur_svg.js";
import { ImgWithFallback } from "./img_with_fallback.js";
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

let manifestData: { images?: Record<string, ManifestEntry> } | undefined;
try {
    manifestData = (await import("virtual:cloudflare-next-intl-images-manifest")).default;
} catch {
    manifestData = undefined;
}
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

/**
 * Builds plain <img> attributes for the <picture> path without touching
 * `next/image`'s own `getImageProps` — that function is a synchronous call
 * (not JSX), and some `next/image` polyfills (e.g. vinext's, built on
 * @unpic/react) mark their entire module "use client", making every export a
 * client reference that can't be invoked directly from non-client code. Since
 * each variant here is already a concrete, pre-generated static asset (no
 * Next.js loader/responsive-breakpoint logic applies), a plain <img> is all
 * that's needed — no `srcSet`/`sizes` computation required beyond passing the
 * caller's own `sizes` straight through.
 */
function toPlainImgAttrs(resolved: ImageProps, src: string): React.ImgHTMLAttributes<HTMLImageElement> {
    const {
        src: _src, alt, width, height, fill: _fill, loader: _loader, quality: _quality,
        preload: _preload, priority, placeholder: _placeholder, blurDataURL: _blurDataURL,
        unoptimized: _unoptimized, overrideSrc: _overrideSrc, onLoadingComplete: _onLoadingComplete,
        layout: _layout, objectFit: _objectFit, objectPosition: _objectPosition,
        lazyBoundary: _lazyBoundary, lazyRoot: _lazyRoot, loading, style, className, sizes,
        ...rest
    } = resolved as ImageProps & Record<string, unknown>;
    void _src; void _fill; void _loader; void _quality; void _preload; void _placeholder;
    void _blurDataURL; void _unoptimized; void _overrideSrc; void _onLoadingComplete;
    void _layout; void _objectFit; void _objectPosition; void _lazyBoundary; void _lazyRoot;

    return {
        ...(rest as React.ImgHTMLAttributes<HTMLImageElement>),
        src,
        alt: alt ?? "",
        width: width as number | undefined,
        height: height as number | undefined,
        className: className as string | undefined,
        style: style as React.CSSProperties | undefined,
        sizes: sizes as string | undefined,
        loading: priority ? "eager" : (loading as React.ImgHTMLAttributes<HTMLImageElement>["loading"] ?? "lazy"),
        fetchPriority: priority ? "high" : "auto",
    };
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

    const primarySrc = variant?.src ?? String(resolved.src);
    const originalSrc = entry?.originalSrc;
    const imgProps = toPlainImgAttrs(resolved, primarySrc);

    return (
        <picture>
            {alternates.map((source) => (
                <source
                    key={source.src}
                    type={source.type}
                    sizes={imgProps.sizes}
                    srcSet={source.src}
                />
            ))}
            <ImgWithFallback {...imgProps} originalSrc={originalSrc} />
        </picture>
    );
}

export function getImageProps(props: ImageProps): ReturnType<typeof nextGetImageProps> {
    const resolved = resolveProps(props);
    return nextGetImageProps(resolved);
}

export { getImageBlurSvg };
