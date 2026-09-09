"use client";

import React from "react";

export interface ImgWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    originalSrc?: string;
}

/**
 * Plain <img> that falls back to `originalSrc` on load error (e.g. a missing
 * or corrupted generated asset). `onError` only works from a Client
 * Component under RSC, so this is split out from the rest of the shim, which
 * stays server-renderable.
 */
export function ImgWithFallback({ originalSrc, ...imgProps }: ImgWithFallbackProps): React.JSX.Element {
    const onError: React.ReactEventHandler<HTMLImageElement> = (event) => {
        const img = event.currentTarget;
        if (originalSrc && img.src !== originalSrc && !img.src.endsWith(originalSrc)) {
            img.srcset = "";
            img.src = originalSrc;
        }
    };

    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...imgProps} onError={onError} />;
}
