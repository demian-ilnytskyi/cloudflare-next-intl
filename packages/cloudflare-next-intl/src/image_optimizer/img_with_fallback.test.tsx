import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ImgWithFallback } from "./img_with_fallback.js";

describe("ImgWithFallback", () => {
    it("renders a plain <img> with the given props", () => {
        const { container } = render(<ImgWithFallback src="/a.avif" alt="a" width={10} height={10} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toBe("/a.avif");
        expect(img?.getAttribute("alt")).toBe("a");
        expect(img?.style.color).toBe("");
    });

    it("falls back to originalSrc on a load error", () => {
        const { container } = render(<ImgWithFallback src="/a.avif" alt="a" originalSrc="/a.png" />);
        const img = container.querySelector("img") as HTMLImageElement;

        Object.defineProperty(img, "src", { value: "https://cdn.example.com/a.avif", writable: true });
        img.dispatchEvent(new Event("error"));

        expect(img.src).toBe("/a.png");
        expect(img.srcset).toBe("");
    });

    it("does nothing on error when originalSrc is not provided", () => {
        const { container } = render(<ImgWithFallback src="/a.avif" alt="a" />);
        const img = container.querySelector("img") as HTMLImageElement;

        Object.defineProperty(img, "src", { value: "https://cdn.example.com/a.avif", writable: true });
        img.dispatchEvent(new Event("error"));

        expect(img.src).toBe("https://cdn.example.com/a.avif");
    });

    it("does not touch src on error once it already matches originalSrc", () => {
        const { container } = render(<ImgWithFallback src="/a.avif" alt="a" originalSrc="/a.png" />);
        const img = container.querySelector("img") as HTMLImageElement;

        Object.defineProperty(img, "src", { value: "/a.png", writable: true });
        img.dispatchEvent(new Event("error"));

        expect(img.src).toBe("/a.png");
    });

    it("renders blur background and removes it on load", () => {
        const blurDataURL = "data:image/svg+xml;base64,testblur";
        const onLoad = vi.fn();
        const { container } = render(
            <ImgWithFallback
                src="/a.avif"
                alt="a"
                blurDataURL={blurDataURL}
                style={{ objectFit: "contain", objectPosition: "top" }}
                onLoad={onLoad}
            />,
        );
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img.style.backgroundImage).toContain(blurDataURL);
        expect(img.style.backgroundSize).toBe("contain");
        expect(img.style.backgroundPosition).toBe("center top");
        expect(img.style.color).toBe("transparent");

        fireEvent.load(img);
        expect(img.style.backgroundImage).toBe("");
        expect(img.style.color).toBe("");
        expect(onLoad).toHaveBeenCalled();
    });

    it("rewrites custom user color to transparent while blur is active and restores it on load", () => {
        const blurDataURL = "data:image/svg+xml;base64,testblur";
        const { container } = render(
            <ImgWithFallback
                src="/a.avif"
                alt="a"
                blurDataURL={blurDataURL}
                style={{ color: "red" }}
            />,
        );
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img.style.color).toBe("transparent");

        fireEvent.load(img);
        expect(img.style.color).toBe("red");
    });

    it("detects already completed image on mount and clears blur", () => {
        const blurDataURL = "data:image/svg+xml;base64,testblur";
        const origComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
        const origNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");

        Object.defineProperty(HTMLImageElement.prototype, "complete", { value: true, configurable: true });
        Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { value: 100, configurable: true });

        try {
            const { container } = render(
                <ImgWithFallback src="/a.avif" alt="a" blurDataURL={blurDataURL} />,
            );
            const img = container.querySelector("img") as HTMLImageElement;
            expect(img.style.backgroundImage).toBe("");
        } finally {
            if (origComplete) {
                Object.defineProperty(HTMLImageElement.prototype, "complete", origComplete);
            } else {
                delete (HTMLImageElement.prototype as { complete?: unknown }).complete;
            }
            if (origNaturalWidth) {
                Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", origNaturalWidth);
            } else {
                delete (HTMLImageElement.prototype as { naturalWidth?: unknown }).naturalWidth;
            }
        }
    });

    it("keeps blur if complete is true but naturalWidth is 0 on mount", () => {
        const blurDataURL = "data:image/svg+xml;base64,testblur";
        const origComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
        const origNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");

        Object.defineProperty(HTMLImageElement.prototype, "complete", { value: true, configurable: true });
        Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { value: 0, configurable: true });

        try {
            const { container } = render(
                <ImgWithFallback src="/a.avif" alt="a" blurDataURL={blurDataURL} />,
            );
            const img = container.querySelector("img") as HTMLImageElement;
            expect(img.style.backgroundImage).toContain(blurDataURL);
        } finally {
            if (origComplete) {
                Object.defineProperty(HTMLImageElement.prototype, "complete", origComplete);
            } else {
                delete (HTMLImageElement.prototype as { complete?: unknown }).complete;
            }
            if (origNaturalWidth) {
                Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", origNaturalWidth);
            } else {
                delete (HTMLImageElement.prototype as { naturalWidth?: unknown }).naturalWidth;
            }
        }
    });
});
