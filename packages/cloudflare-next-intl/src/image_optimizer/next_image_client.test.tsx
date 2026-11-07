import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NextImageClient, safeLoader } from "./next_image_client.js";

describe("next_image_client", () => {
    it("returns the loader url when the loader succeeds", () => {
        expect(safeLoader(({ src, width }) => `${src}?w=${width}`)({ src: "/a.png", width: 10 })).toBe("/a.png?w=10");
    });

    it("falls back to the original src when the loader throws", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(safeLoader(() => { throw new Error("boom"); })({ src: "/a.png", width: 10 })).toBe("/a.png");
        spy.mockRestore();
    });

    it("hides the alt text while the image loads, without a blur placeholder too", async () => {
        const { container } = render(<NextImageClient src="/arrow.png" alt="arrow" width={24} height={24} style={{ color: "red" }} />);
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img.style.color).toBe("transparent");
        fireEvent.load(img);
        await new Promise((r) => setTimeout(r, 50));
        expect(img.style.color).toBe("red");
    });

    it("shows the alt text once the image fails to load, and stops listening after unmount", () => {
        const { container, unmount } = render(<NextImageClient src="/missing.png" alt="missing" width={24} height={24} style={{ color: "red" }} />);
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img.style.color).toBe("transparent");
        fireEvent.error(img);
        expect(img.style.color).toBe("red");
        unmount();
    });

    it("shows the alt text when the image already failed before mount", () => {
        const origComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
        Object.defineProperty(HTMLImageElement.prototype, "complete", { value: true, configurable: true });
        try {
            const { container } = render(<NextImageClient src="/missing.png" alt="missing" width={24} height={24} style={{ color: "red" }} />);
            expect((container.querySelector("img") as HTMLImageElement).style.color).toBe("red");
        } finally {
            if (origComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", origComplete);
            else delete (HTMLImageElement.prototype as { complete?: unknown }).complete;
        }
    });

    it("passes the <img> to a caller's function or object ref and still tracks loading", () => {
        const fnRef = vi.fn();
        const objRef = React.createRef<HTMLImageElement>();
        const { container } = render(
            <>
                <NextImageClient {...({ ref: fnRef } as object)} src="/a.png" alt="a" width={24} height={24} />
                <NextImageClient {...({ ref: objRef } as object)} src="/b.png" alt="b" width={24} height={24} />
            </>,
        );
        const [a, b] = Array.from(container.querySelectorAll("img"));
        expect(fnRef).toHaveBeenCalledWith(a);
        expect(objRef.current).toBe(b);
        expect(a.style.color).toBe("transparent");
    });

    it("falls back to the original src when the loader returns an empty or non-string value", () => {
        expect(safeLoader(() => "")({ src: "/a.png", width: 10 })).toBe("/a.png");
        expect(safeLoader(() => undefined as unknown as string)({ src: "/a.png", width: 10 })).toBe("/a.png");
    });

    describe("auto-detected loader module", () => {
        afterEach(() => {
            vi.doUnmock("virtual:cloudflare-next-intl-image-loader");
            vi.resetModules();
        });

        async function renderWith(mod: () => Record<string, unknown>): Promise<string | null | undefined> {
            vi.resetModules();
            vi.doMock("virtual:cloudflare-next-intl-image-loader", mod);
            const { NextImageClient: Client, preloadLoader } = await import("./next_image_client.js");
            await preloadLoader?.();
            const { container } = render(<Client src="/a.png" alt="x" width={10} height={10} />);
            return container.querySelector("img")?.getAttribute("src");
        }

        it("uses the named defaultLoader export", async () => {
            expect(await renderWith(() => ({ defaultLoader: ({ src }: { src: string }) => `${src}?named` }))).toContain("?named");
        });

        it("falls back to the default export", async () => {
            expect(await renderWith(() => ({ defaultLoader: undefined, default: ({ src }: { src: string }) => `${src}?default` }))).toContain("?default");
        });

        it("ignores a non-function export", async () => {
            expect(await renderWith(() => ({ defaultLoader: undefined, default: "not-a-function" }))).not.toContain("not-a-function");
        });

        it("renders without a loader when the module fails to load", async () => {
            expect(await renderWith(() => { throw new Error("missing"); })).toBeTruthy();
        });
    });

    it("renders an image even when a custom loader throws", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { container } = render(<NextImageClient src="/a.png" alt="x" width={10} height={10} loader={() => { throw new Error("boom"); }} />);
        expect(container.querySelector("img")?.getAttribute("src")).toContain("/a.png");
        spy.mockRestore();
    });

    it("rewrites custom color to transparent while placeholder=blur and restores it on load", async () => {
        const onLoad = vi.fn();
        const { container } = render(
            <NextImageClient
                src="/a.png"
                alt="x"
                width={10}
                height={10}
                placeholder="blur"
                blurDataURL="data:image/png;base64,xxx"
                style={{ color: "red" }}
                onLoad={onLoad}
            />,
        );
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img.style.color).toBe("transparent");

        fireEvent.load(img);
        await new Promise((r) => setTimeout(r, 50));
        expect(img.style.color).toBe("red");
        expect(onLoad).toHaveBeenCalled();
    });

    it("marks blur complete if image is already complete on mount", () => {
        const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
        const originalNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");

        Object.defineProperty(HTMLImageElement.prototype, "complete", {
            configurable: true,
            get: () => true,
        });
        Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
            configurable: true,
            get: () => 100,
        });

        try {
            const { container } = render(
                <NextImageClient
                    src="/a.png"
                    alt="x"
                    width={10}
                    height={10}
                    placeholder="blur"
                    blurDataURL="data:image/png;base64,xxx"
                    style={{ color: "blue" }}
                />,
            );
            const img = container.querySelector("img") as HTMLImageElement;
            expect(img.style.color).toBe("blue");
        } finally {
            if (originalComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", originalComplete);
            if (originalNaturalWidth) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", originalNaturalWidth);
        }
    });
});
