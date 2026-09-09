import { describe, it, expect } from "vitest";
import Image, { getImageBlurSvg, getImageProps } from "./image.js";

describe("image entrypoint", () => {
    it("exports default Image component, getImageProps and getImageBlurSvg", () => {
        expect(typeof Image).toBe("function");
        expect(typeof getImageProps).toBe("function");
        expect(typeof getImageBlurSvg).toBe("function");
    });
});
