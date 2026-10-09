"use client";

import React from "react";
import NextImage from "next/image.js";
import type { ImageProps } from "next/image.js";

type Loader = (props: { src: string; width: number; quality?: number }) => string;

let defaultCustomLoader: Loader | undefined;
try {
    const loaderMod = (await import(/* webpackIgnore: true */ "virtual:cloudflare-next-intl-image-loader")) as {
        defaultLoader?: Loader;
        default?: Loader;
    };
    const candidate = loaderMod.defaultLoader ?? loaderMod.default;
    defaultCustomLoader = typeof candidate === "function" ? candidate : undefined;
} catch {
    defaultCustomLoader = undefined;
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

const safeDefaultLoader = defaultCustomLoader ? safeLoader(defaultCustomLoader) : undefined;

export function NextImageClient(props: ImageProps): React.JSX.Element {
    const loader = typeof props.loader === "function" ? safeLoader(props.loader) : safeDefaultLoader;
    return <NextImage {...props} loader={loader} />;
}
