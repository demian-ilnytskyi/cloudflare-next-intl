import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
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
            const { NextImageClient: Client } = await import("./next_image_client.js");
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
});
