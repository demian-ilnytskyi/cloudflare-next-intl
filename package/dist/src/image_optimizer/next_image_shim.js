import { jsx as _jsx } from "react/jsx-runtime";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import manifest from "virtual:cloudflare-next-intl-images-manifest";
import { getImageBlurSvg } from "./blur_svg.js";
const manifestData = manifest;
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
function resolveProps(props) {
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
            }
            else if (typeof src === "object" && src !== null && "src" in src) {
                src = { ...src, src: entry.src };
            }
            else {
                src = entry.src;
            }
        }
        if (!blurDataURL && props.placeholder === "blur" && entry.blurDataURL) {
            blurDataURL = getImageBlurSvg(entry.blurDataURL, entry.blurWidth, entry.blurHeight, props.style?.objectFit);
        }
        if (!width && !props.fill && entry.width) {
            width = entry.width;
            height = entry.height;
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
    return _jsx(NextImage, { ...resolved });
}
export function getImageProps(props) {
    const resolved = resolveProps(props);
    return nextGetImageProps(resolved);
}
export { getImageBlurSvg };
