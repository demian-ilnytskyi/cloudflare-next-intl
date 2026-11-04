"use client";

import React from "react";
import NextImage from "next/image.js";
import type { ImageProps } from "next/image.js";

type Loader = (props: { src: string; width: number; quality?: number }) => string;

let defaultCustomLoader: Loader | undefined;
let loaderInitPromise: Promise<void> | undefined;

function ensureLoader(): Promise<void> {
    if (!loaderInitPromise) {
        loaderInitPromise = import(/* webpackIgnore: true */ "virtual:cloudflare-next-intl-image-loader")
            .then((mod) => {
                const loaderMod = mod as {
                    defaultLoader?: Loader;
                    default?: Loader;
                };
                const candidate = loaderMod?.defaultLoader ?? loaderMod?.default;
                defaultCustomLoader = typeof candidate === "function" ? candidate : undefined;
            })
            .catch(() => undefined);
    }
    return loaderInitPromise;
}
ensureLoader();

export async function preloadLoader(): Promise<void> {
    await ensureLoader();
}

export function safeLoader(loader: Loader): Loader {
    return (params) => {
        try {
            const url = loader(params);
            if (typeof url === "string" && url !== "") return url;
        } catch (error) {
            console.error("[cloudflare-next-intl] image loader failed, using original src:", params.src, error);
        }
        return params.src;
    };
}

export function NextImageClient(props: ImageProps): React.JSX.Element {
    const [blurComplete, setBlurComplete] = React.useState(false);
    const innerRef = React.useRef<HTMLImageElement | null>(null);

    React.useEffect(() => {
        const img = innerRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
            setBlurComplete(true);
        }
    }, [props.src]);

    const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
        setBlurComplete(true);
        props.onLoad?.(event);
    };

    const isBlurActive = props.placeholder === "blur" && !blurComplete;
    const style = isBlurActive
        ? { ...(props.style as React.CSSProperties | undefined), color: "transparent" }
        : props.style;

    const loaderCandidate = typeof props.loader === "function" ? props.loader : defaultCustomLoader;
    const loader = typeof loaderCandidate === "function" ? safeLoader(loaderCandidate) : undefined;
    return <NextImage ref={innerRef} {...props} style={style} onLoad={handleLoad} loader={loader} />;
}
