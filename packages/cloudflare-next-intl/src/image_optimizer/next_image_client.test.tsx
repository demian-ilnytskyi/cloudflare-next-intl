import { describe, it, expect, vi } from "vitest";
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

    it("renders an image even when a custom loader throws", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { container } = render(<NextImageClient src="/a.png" alt="x" width={10} height={10} loader={() => { throw new Error("boom"); }} />);
        expect(container.querySelector("img")?.getAttribute("src")).toContain("/a.png");
        spy.mockRestore();
    });
});
