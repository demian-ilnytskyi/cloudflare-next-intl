import React from "react";
export interface ImgWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    originalSrc?: string;
}
export declare function ImgWithFallback({ originalSrc, ...imgProps }: ImgWithFallbackProps): React.JSX.Element;
