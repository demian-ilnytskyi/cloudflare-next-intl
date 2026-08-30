import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import { getImageBlurSvg } from "./blur_svg.js";
function pickVariant(entry, requestedWidth) {
    if (!requestedWidth || !entry.variants || entry.variants.length === 0) {
        return entry;
    }
    const atLeast = entry.variants.filter((v) => v.width >= requestedWidth);
    if (atLeast.length > 0) {
        return atLeast.reduce((best, v) => (v.width < best.width ? v : best));
    }
    return entry.variants.reduce((best, v) => (v.width > best.width ? v : best));
}
let manifestData;
try {
    manifestData = (await import("virtual:cloudflare-next-intl-images-manifest")).default;
}
catch {
    manifestData = undefined;
}
const images = (manifestData && typeof manifestData === "object" && manifestData.images)
    ? manifestData.images
    : {};
function findEntry(srcVal) {
    if (!srcVal)
        return undefined;
    const raw = typeof srcVal === "string"
        ? srcVal
        : (typeof srcVal === "object" && srcVal !== null && "src" in srcVal)
            ? String(srcVal.src)
            : String(srcVal);
    if (images[raw])
        return images[raw];
    const withoutPublic = raw.replace(/^\/?public/, "");
    if (images[withoutPublic])
        return images[withoutPublic];
    const withSlash = withoutPublic.startsWith("/") ? withoutPublic : "/" + withoutPublic;
    if (images[withSlash])
        return images[withSlash];
    const clean = withSlash.split("?")[0].split("#")[0];
    if (images[clean])
        return images[clean];
    for (const [key, entry] of Object.entries(images)) {
        const filename = key.split("/").pop();
        if (filename && (clean.endsWith("/" + filename) || clean.includes(filename.split(".")[0]))) {
            return entry;
        }
    }
    return undefined;
}
function retargetSrcSet(srcSet, fromSrc, toSrc) {
    if (!srcSet)
        return srcSet;
    const fromEncoded = encodeURIComponent(fromSrc);
    const toEncoded = encodeURIComponent(toSrc);
    return srcSet
        .split(fromEncoded).join(toEncoded)
        .split(fromSrc).join(toSrc);
}
function resolveProps(props) {
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
            }
            else if (typeof src === "object" && src !== null && "src" in src) {
                src = { ...src, src: variant.src };
            }
            else {
                src = variant.src;
            }
        }
        if (!blurDataURL && props.placeholder === "blur" && variant.blurDataURL) {
            blurDataURL = getImageBlurSvg(variant.blurDataURL, variant.blurWidth, variant.blurHeight, props.style?.objectFit);
        }
        if (!width && !props.fill && variant.width) {
            width = variant.width;
            height = variant.height;
        }
    }
    if (props.placeholder === "blur" && blurDataURL) {
        const objectFit = props.style?.objectFit || (props.className?.includes("object-contain") ? "contain" : "cover");
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
export default function Image(props) {
    const resolved = resolveProps(props);
    const entry = findEntry(props.src);
    const variant = entry
        ? pickVariant(entry, typeof props.width === "number" ? props.width : undefined)
        : undefined;
    const alternates = (variant?.sources ?? []).filter((source) => source.src !== variant?.src);
    if (alternates.length === 0) {
        return _jsx(NextImage, { ...resolved });
    }
    const { props: imgProps } = nextGetImageProps(resolved);
    const primarySrc = variant?.src ?? String(imgProps.src);
    const originalSrc = entry?.originalSrc;
    const onError = (event) => {
        const img = event.currentTarget;
        if (originalSrc && img.src !== originalSrc && !img.src.endsWith(originalSrc)) {
            img.srcset = "";
            img.src = originalSrc;
        }
    };
    return (_jsxs("picture", { children: [alternates.map((source) => (_jsx("source", { type: source.type, sizes: imgProps.sizes, srcSet: imgProps.srcSet
                    ? retargetSrcSet(imgProps.srcSet, primarySrc, source.src)
                    : source.src }, source.src))), _jsx("img", { ...imgProps, onError: onError })] }));
}
export function getImageProps(props) {
    const resolved = resolveProps(props);
    return nextGetImageProps(resolved);
}
export { getImageBlurSvg };
