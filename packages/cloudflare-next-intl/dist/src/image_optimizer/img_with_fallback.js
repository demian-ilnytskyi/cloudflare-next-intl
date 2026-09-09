"use client";
import { jsx as _jsx } from "react/jsx-runtime";
export function ImgWithFallback({ originalSrc, ...imgProps }) {
    const onError = (event) => {
        const img = event.currentTarget;
        if (originalSrc && img.src !== originalSrc && !img.src.endsWith(originalSrc)) {
            img.srcset = "";
            img.src = originalSrc;
        }
    };
    return _jsx("img", { ...imgProps, onError: onError });
}
