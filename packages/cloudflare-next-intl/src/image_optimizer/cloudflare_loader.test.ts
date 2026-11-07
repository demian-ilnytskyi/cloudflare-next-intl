import { afterEach, describe, expect, it, vi } from "vitest";
import createDefault, { createCloudflareImageLoader, DEFAULT_CLOUDFLARE_MIN_WIDTH } from "./cloudflare_loader.js";

describe("createCloudflareImageLoader", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("requests at least 160px by default and keeps wider widths", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_LOCAL", "");
        const loader = createCloudflareImageLoader();
        expect(DEFAULT_CLOUDFLARE_MIN_WIDTH).toBe(160);
        expect(loader({ src: "/generated/images/navbar/arrow_icon.webp", width: 24, quality: 75 }))
            .toBe("/cdn-cgi/image/width=160,format=auto,quality=75/generated/images/navbar/arrow_icon.webp");
        expect(loader({ src: "images/hero.png", width: 1200 })).toBe("/cdn-cgi/image/width=1200,format=auto/images/hero.png");
        expect(loader({ src: "/a.png" })).toBe("/cdn-cgi/image/width=auto,format=auto/a.png");
        expect(createDefault).toBe(createCloudflareImageLoader);
    });

    it("uses a custom minimum width", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_LOCAL", "");
        expect(createCloudflareImageLoader({ minWidth: 48 })({ src: "/a.png", width: 24 }))
            .toBe("/cdn-cgi/image/width=48,format=auto/a.png");
        expect(createCloudflareImageLoader({ minWidth: 0 })({ src: "/a.png", width: 24 }))
            .toBe("/cdn-cgi/image/width=24,format=auto/a.png");
    });

    it("returns the original src in development or with NEXT_PUBLIC_LOCAL, unless turned off", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(createCloudflareImageLoader()({ src: "/a.png", width: 24 })).toBe("/a.png");
        expect(createCloudflareImageLoader({ localPassthrough: false })({ src: "/a.png", width: 24 }))
            .toBe("/cdn-cgi/image/width=160,format=auto/a.png");
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_LOCAL", "true");
        expect(createCloudflareImageLoader()({ src: "/a.png", width: 24 })).toBe("/a.png");
    });

    it("does not throw where process is not defined", () => {
        vi.stubGlobal("process", undefined);
        expect(createCloudflareImageLoader()({ src: "/a.png", width: 24 })).toBe("/cdn-cgi/image/width=160,format=auto/a.png");
    });
});
