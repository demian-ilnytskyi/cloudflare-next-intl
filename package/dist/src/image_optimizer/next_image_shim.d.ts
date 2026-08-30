import React from "react";
import { getImageProps as nextGetImageProps } from "next/image";
import type { ImageProps } from "next/image";
import { getImageBlurSvg } from "./blur_svg.js";
import type { OptimizedImage } from "./types.js";
export type ManifestEntry = OptimizedImage;
export default function Image(props: ImageProps): React.JSX.Element;
export declare function getImageProps(props: ImageProps): ReturnType<typeof nextGetImageProps>;
export { getImageBlurSvg };
