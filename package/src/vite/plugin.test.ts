import { describe, it, expect } from "vitest";
import { cloudflareNextIntl, cloudflareNextIntlPlugin } from "./plugin";
import * as viteIndex from "./index";

describe("cloudflareNextIntl (main plugin)", () => {
    it("returns array of plugins by default", () => {
        const plugins = cloudflareNextIntl();
        expect(Array.isArray(plugins)).toBe(true);
        expect(plugins.length).toBe(4);

        const pluginNames = plugins.map((p) => p.name);
        expect(pluginNames).toContain("cfni:build-id-asset");
        expect(pluginNames).toContain("cfni:cf-workers-client-stub");
        expect(pluginNames).toContain("cfni:user-agent-stub");
        expect(pluginNames).toContain("cfni:locale-file");
    });

    it("allows disabling specific plugins", () => {
        const plugins = cloudflareNextIntl({
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(0);
    });

    it("supports custom buildIdAsset filename", () => {
        const plugins = cloudflareNextIntl({
            buildIdAsset: "CUSTOM_BUILD_ID",
            cfWorkersClientStub: false,
            userAgentStub: false,
            localeFiles: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cfni:build-id-asset");
    });

    it("exports plugin aliases and index exports", () => {
        expect(cloudflareNextIntlPlugin).toBe(cloudflareNextIntl);
        expect(viteIndex.cloudflareNextIntl).toBe(cloudflareNextIntl);
        expect(viteIndex.default).toBe(cloudflareNextIntl);
        expect(typeof viteIndex.buildIdAsset).toBe("function");
        expect(typeof viteIndex.localeFilePlugin).toBe("function");
        expect(typeof viteIndex.userAgentStubPlugin).toBe("function");
        expect(typeof viteIndex.cfWorkersClientStubPlugin).toBe("function");
    });
});
