import { describe, it, expect } from "vitest";
import { getImageBlurSvg } from "./blur_svg.js";

describe("blur_svg", () => {
    it("getImageBlurSvg returns data uri with embedded svg and feGaussianBlur", () => {
        const dummyBlur = "data:image/webp;base64,UklGRmY=";
        const svgUri = getImageBlurSvg(dummyBlur, 8, 6, "cover", 20);

        expect(svgUri.startsWith("data:image/svg+xml;base64,")).toBe(true);

        const decoded = Buffer.from(svgUri.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
        expect(decoded).toContain("feGaussianBlur");
        expect(decoded).toContain("stdDeviation='20'");
        expect(decoded).toContain("viewBox='0 0 320 240'");
        expect(decoded).toContain("preserveAspectRatio='none'");
        expect(decoded).toContain(`href='${dummyBlur}'`);
    });

    it("getImageBlurSvg handles contain and cover objectFit without viewBox", () => {
        const dummyBlur = "data:image/webp;base64,UklGRmY=";
        const containUri = getImageBlurSvg(dummyBlur, undefined, undefined, "contain", 15);
        const containDecoded = Buffer.from(containUri.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
        expect(containDecoded).toContain("preserveAspectRatio='xMidYMid'");
        expect(containDecoded).toContain("stdDeviation='15'");

        const coverUri = getImageBlurSvg(dummyBlur, undefined, undefined, "cover", 20);
        const coverDecoded = Buffer.from(coverUri.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
        expect(coverDecoded).toContain("preserveAspectRatio='xMidYMid slice'");

        const defaultUri = getImageBlurSvg(dummyBlur, undefined, undefined, undefined);
        const defaultDecoded = Buffer.from(defaultUri.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
        expect(defaultDecoded).toContain("preserveAspectRatio='none'");
    });

    it("toBase64 falls back to btoa and empty string when Buffer is unavailable", () => {
        const dummyBlur = "data:image/webp;base64,UklGRmY=";
        const origBuffer = globalThis.Buffer;
        try {
            // @ts-expect-error simulate browser without Buffer
            delete globalThis.Buffer;
            const btoaUri = getImageBlurSvg(dummyBlur, 8, 8);
            expect(btoaUri.startsWith("data:image/svg+xml;base64,")).toBe(true);

            // @ts-expect-error simulate environment without btoa
            const origBtoa = globalThis.btoa;
            try {
                // @ts-expect-error delete btoa
                delete globalThis.btoa;
                const fallbackUri = getImageBlurSvg(dummyBlur, 8, 8);
                expect(fallbackUri).toBe("data:image/svg+xml;base64,");
            } finally {
                globalThis.btoa = origBtoa;
            }
        } finally {
            globalThis.Buffer = origBuffer;
        }
    });
});

