export function getImageBlurSvg(blurDataURL, blurWidth, blurHeight, objectFit, stdDeviation = 20) {
    const std = stdDeviation;
    const viewBox = blurWidth && blurHeight
        ? `viewBox='0 0 ${blurWidth * 40} ${blurHeight * 40}'`
        : "";
    const preserveAspectRatio = viewBox
        ? "none"
        : objectFit === "contain"
            ? "xMidYMid"
            : objectFit === "cover"
                ? "xMidYMid slice"
                : "none";
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' ${viewBox}><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${std}'/><feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/><feFlood x='0' y='0' width='100%' height='100%'/><feComposite operator='out' in='s'/><feComposite in2='SourceGraphic'/><feGaussianBlur stdDeviation='${std}'/></filter><image width='100%' height='100%' x='0' y='0' preserveAspectRatio='${preserveAspectRatio}' style='filter: url(#b);' href='${blurDataURL}'/></svg>`;
    const base64 = Buffer.from(svg).toString("base64");
    return `data:image/svg+xml;base64,${base64}`;
}
