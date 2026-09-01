import { describe, it, expect } from "vitest";
import { cloudflareNextIntl, cloudflareNextIntlPlugin } from "./plugin.js";
import * as viteIndex from "./index.js";

describe("cloudflareNextIntl (main plugin)", () => {
    it("returns array of plugins by default", () => {
        const plugins = cloudflareNextIntl();
        expect(Array.isArray(plugins)).toBe(true);
        expect(plugins.length).toBe(6);

        const pluginNames = plugins.map((p) => p.name);
        expect(pluginNames).toContain("cloudflare-next-intl-auto-dynamic-pages");
        expect(pluginNames).toContain("cloudflare-next-intl-image-optimizer");
        expect(pluginNames).toContain("cfni:build-id-asset");
        expect(pluginNames).toContain("cfni:cf-workers-client-stub");
        expect(pluginNames).toContain("cfni:user-agent-stub");
        expect(pluginNames).toContain("cfni:locale-file");
    });

    it("allows disabling specific plugins", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(0);
    });

    it("supports custom buildIdAsset filename", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            imageOptimizer: false,
            buildIdAsset: "CUSTOM_BUILD_ID",
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cfni:build-id-asset");
    });

    it("supports custom imageOptimizer configuration", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            imageOptimizer: {
                maxWidth: 1200,
                formats: ["webp"],
            },
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cloudflare-next-intl-image-optimizer");
    });

    it("supports custom autoDynamicPages configuration", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: {
                mode: "report",
                target: "next",
            },
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cloudflare-next-intl-auto-dynamic-pages");
    });

    it("exports plugin aliases and index exports", () => {
        expect(cloudflareNextIntlPlugin).toBe(cloudflareNextIntl);
        expect(viteIndex.cloudflareNextIntl).toBe(cloudflareNextIntl);
        expect(viteIndex.default).toBe(cloudflareNextIntl);
        expect(typeof viteIndex.autoDynamicPagesPlugin).toBe("function");
        expect(typeof viteIndex.imageOptimizer).toBe("function");
        expect(typeof viteIndex.imageOptimizerPlugin).toBe("function");
        expect(typeof viteIndex.buildIdAsset).toBe("function");
        expect(typeof viteIndex.localeFilePlugin).toBe("function");
        expect(typeof viteIndex.userAgentStubPlugin).toBe("function");
        expect(typeof viteIndex.cfWorkersClientStubPlugin).toBe("function");
    });
});
