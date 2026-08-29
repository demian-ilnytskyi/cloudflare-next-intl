import { jsx as _jsx } from "react/jsx-runtime";
import NextImage, { getImageProps as nextGetImageProps } from "next/image";
import manifest from "virtual:cloudflare-next-intl-images-manifest";
import { getImageBlurSvg } from "./blur_svg.js";
const manifestData = manifest;
const images = (manifestData && typeof manifestData === "object" && manifestData.images)
    ? manifestData.images
    : {};
function resolveProps(props) {
    let src = props.src;
    let blurDataURL = props.blurDataURL;
    let width = props.width;
    let height = props.height;
    if (typeof src === "string") {
        const entry = images[src];
        if (entry) {
            if (entry.src)
                src = entry.src;
            if (!blurDataURL && props.placeholder === "blur" && entry.blurDataURL) {
                blurDataURL = getImageBlurSvg(entry.blurDataURL, entry.blurWidth, entry.blurHeight, props.style?.objectFit);
            }
            if (!width && !props.fill && entry.width) {
                width = entry.width;
                height = entry.height;
            }
        }
    }
    return { ...props, src, blurDataURL, width, height };
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
