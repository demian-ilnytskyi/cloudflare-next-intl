import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ImgWithFallback } from "./img_with_fallback.js";

describe("ImgWithFallback", () => {
    it("renders a plain <img> with the given props", () => {
        const { container } = render(<ImgWithFallback src="/a.avif" alt="a" width={10} height={10} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toBe("/a.avif");
        expect(img?.getAttribute("alt")).toBe("a");
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
});
