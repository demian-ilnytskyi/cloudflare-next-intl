import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Image, { getImageProps } from "./next_image_shim.js";

describe("next_image_shim", () => {
    it("renders a plain <img> (no <picture>) when the manifest entry has a single source", () => {
        const { container } = render(<Image src="/images/hero.png" alt="hero" />);

        expect(container.querySelector("picture")).toBeNull();
        const img = container.querySelector("img");
        expect(img).toBeTruthy();
        expect(img?.getAttribute("src")).toContain("hero.webp");
    });

    it("fills in width/height from the manifest when not provided", () => {
        const { container } = render(<Image src="/images/hero.png" alt="hero" />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("width")).toBe("800");
        expect(img?.getAttribute("height")).toBe("600");
    });

    it("does not override explicit width/height", () => {
        const { container } = render(<Image src="/images/hero.png" alt="hero" width={50} height={50} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("width")).toBe("50");
        expect(img?.getAttribute("height")).toBe("50");
    });

    it("passes through an unknown src unchanged", () => {
        const { container } = render(<Image src="/images/unknown.png" alt="unknown" width={10} height={10} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("unknown.png");
    });

    it("applies an inline blur background when placeholder=blur and the manifest has a blurDataURL", () => {
        const { container } = render(
            <Image src="/images/hero.png" alt="hero" placeholder="blur" />,
        );
        const img = container.querySelector("img");
        expect(img?.style.backgroundImage).toContain("data:image/svg+xml");
        expect(img?.style.backgroundSize).toBe("cover");
    });

    it("does not add a blur background for an entry without blurDataURL", () => {
        const { container } = render(<Image src="/images/multi.png" alt="multi" />);
        const img = container.querySelector("img");
        expect(img?.style.backgroundImage).toBe("");
    });

    it("renders a <picture> with one <source> per alternate format, primary format as the <img> fallback", () => {
        const { container } = render(<Image src="/images/multi.png" alt="multi" />);

        const picture = container.querySelector("picture");
        expect(picture).toBeTruthy();

        const sources = Array.from(picture!.querySelectorAll("source"));
        expect(sources).toHaveLength(1);
        expect(sources[0].getAttribute("type")).toBe("image/webp");
        expect(sources[0].getAttribute("srcset")).toContain("multi.webp");

        const img = picture!.querySelector("img");
        expect(img?.getAttribute("src")).toContain("multi.avif");
    });

    it("falls back the <img> src to the manifest's originalSrc on a load error", () => {
        const { container } = render(<Image src="/images/multi.png" alt="multi" />);
        const img = container.querySelector("img") as HTMLImageElement;

        Object.defineProperty(img, "src", { value: "https://example.com/generated/images/multi.avif", writable: true });
        img.dispatchEvent(new Event("error"));

        expect(img.src).toBe("/images/multi.png");
        expect(img.srcset).toBe("");
    });

    it("does not touch the <img> src on error once it already matches originalSrc", () => {
        const { container } = render(<Image src="/images/multi.png" alt="multi" />);
        const img = container.querySelector("img") as HTMLImageElement;

        Object.defineProperty(img, "src", { value: "/images/multi.png", writable: true });
        img.dispatchEvent(new Event("error"));

        expect(img.src).toBe("/images/multi.png");
    });

    it("picks the smallest variant that still covers the requested width", () => {
        const { container } = render(<Image src="/images/sized.png" alt="sized" width={200} height={150} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("sized-200w.webp");
    });

    it("picks the default (largest generated) variant when no width prop is given", () => {
        const { container } = render(<Image src="/images/sized.png" alt="sized" />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("sized.webp");
        expect(img?.getAttribute("src")).not.toContain("sized-200w");
    });

    it("falls back to the largest variant when the requested width exceeds every generated size", () => {
        const { container } = render(<Image src="/images/sized.png" alt="sized" width={5000} height={3750} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("sized.webp");
    });

    it("picks the closest larger variant when the requested width falls between two", () => {
        const { container } = render(<Image src="/images/sized.png" alt="sized" width={500} height={375} />);
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("sized.webp");
        expect(img?.getAttribute("src")).not.toContain("sized-200w");
    });

    it("getImageProps resolves the manifest src the same way the component does", () => {
        const { props } = getImageProps({ src: "/images/hero.png", alt: "hero" });
        expect(String(props.src)).toContain("hero.webp");
        expect(props.width).toBe(800);
        expect(props.height).toBe(600);
    });
});
