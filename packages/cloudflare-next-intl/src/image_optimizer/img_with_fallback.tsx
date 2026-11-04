"use client";

import React from "react";

export interface ImgWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    originalSrc?: string;
    blurDataURL?: string;
}

/**
 * Plain <img> that falls back to `originalSrc` on load error (e.g. a missing
 * or corrupted generated asset) and cleans up blurDataURL background on load.
 * `onError`/`onLoad` only works from a Client Component under RSC, so this is
 * split out from the rest of the shim, which stays server-renderable.
 */
export function ImgWithFallback({
    originalSrc,
    blurDataURL,
    style,
    onLoad,
    ...imgProps
}: ImgWithFallbackProps): React.JSX.Element {
    const [blurComplete, setBlurComplete] = React.useState(false);
    const imgRef = React.useRef<HTMLImageElement>(null);

    React.useEffect(() => {
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
            setBlurComplete(true);
        }
    }, []);

    const onError: React.ReactEventHandler<HTMLImageElement> = (event) => {
        const img = event.currentTarget;
        if (originalSrc && img.src !== originalSrc && !img.src.endsWith(originalSrc)) {
            img.srcset = "";
            img.src = originalSrc;
        }
    };

    const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
        setBlurComplete(true);
        onLoad?.(event);
    };

    const blurStyle = (!blurComplete && blurDataURL) ? {
        backgroundImage: `url("${blurDataURL}")`,
        backgroundSize: (style as React.CSSProperties | undefined)?.objectFit || "cover",
        backgroundPosition: (style as React.CSSProperties | undefined)?.objectPosition || "50% 50%",
        backgroundRepeat: "no-repeat",
        color: "transparent",
    } : undefined;

    return (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
            ref={imgRef}
            {...imgProps}
            style={{ ...style, ...blurStyle }}
            onLoad={handleLoad}
            onError={onError}
        />
    );
}
