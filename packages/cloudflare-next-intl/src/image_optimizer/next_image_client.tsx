"use client";

import React from "react";
import NextImage from "next/image.js";
import type { ImageProps } from "next/image.js";
import { assignRef } from "./assign_ref.js";

type Loader = (props: { src: string; width: number; quality?: number }) => string;

let defaultCustomLoader: Loader | undefined;
let loaderInitPromise: Promise<void> | undefined;

export function applyLoaderModule(mod: unknown): void {
    const loaderMod = mod as {
        defaultLoader?: Loader;
        default?: Loader;
    };
    const candidate = loaderMod?.defaultLoader ?? loaderMod?.default;
    defaultCustomLoader = typeof candidate === "function" ? candidate : undefined;
}

function ensureLoader(): Promise<void> {
    if (!loaderInitPromise) {
        loaderInitPromise = import(/* webpackIgnore: true */ "virtual:cloudflare-next-intl-image-loader")
            .then(applyLoaderModule)
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

export function NextImageClient(allProps: ImageProps): React.JSX.Element {
    // A caller's `ref` (a plain prop in React 19) must not replace the one this component reads.
    const { ref: callerRef, ...props } = allProps as ImageProps & { ref?: React.Ref<HTMLImageElement> };
    const [settled, setSettled] = React.useState(false);
    const innerRef = React.useRef<HTMLImageElement | null>(null);
    const setRef = React.useCallback((node: HTMLImageElement | null) => {
        innerRef.current = node;
        assignRef(callerRef, node);
    }, [callerRef]);

    React.useEffect(() => {
        const img = innerRef.current as HTMLImageElement;
        // `complete` is also true for an image that already failed, e.g. a server-rendered
        // <img> whose request errored before hydration attached the listener below.
        if (img.complete && img.getAttribute("src")) {
            setSettled(true);
            return undefined;
        }
        // A native listener, not an `onError` prop: next/image shims re-assign `img.src`
        // on mount whenever an `onError` prop is passed.
        const onError = (): void => setSettled(true);
        img.addEventListener("error", onError);
        return () => img.removeEventListener("error", onError);
    }, [props.src]);

    const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
        setSettled(true);
        props.onLoad?.(event);
    };

    // Like next/image: while the image is loading, browsers that paint the alt text
    // inside the box would show it, so hide it until the image loads or fails.
    const style = settled
        ? props.style
        : { ...(props.style as React.CSSProperties | undefined), color: "transparent" };

    const loaderCandidate = typeof props.loader === "function" ? props.loader : defaultCustomLoader;
    const loader = typeof loaderCandidate === "function" ? safeLoader(loaderCandidate) : undefined;
    return <NextImage {...props} ref={setRef} style={style} onLoad={handleLoad} loader={loader} />;
}
