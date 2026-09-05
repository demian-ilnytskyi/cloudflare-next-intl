import { describe, it, expect } from "vitest";
import { cloudflareNextIntl, cloudflareNextIntlPlugin } from "./plugin.js";
import * as viteIndex from "./index.js";

describe("cloudflareNextIntl (main plugin)", () => {
    it("returns array of plugins by default", () => {
        const plugins = cloudflareNextIntl();
        expect(Array.isArray(plugins)).toBe(true);
        expect(plugins.length).toBe(9);

        const pluginNames = plugins.map((p) => p.name);
        expect(pluginNames).toContain("cloudflare-next-intl-auto-dynamic-pages");
        expect(pluginNames).toContain("cloudflare-next-intl-auto-locale-params");
        expect(pluginNames).toContain("cloudflare-next-intl-image-optimizer");
        expect(pluginNames).toContain("cfni:build-id-asset");
        expect(pluginNames).toContain("cfni:cf-workers-client-stub");
        expect(pluginNames).toContain("cfni:user-agent-stub");
        expect(pluginNames).toContain("cfni:vinext-route-wiring-fix");
        expect(pluginNames).toContain("cfni:locale-file");
        expect(pluginNames).toContain("cloudflare-next-intl-lucide-optimizer");
    });

    it("runs autoLocaleParams before autoDynamicPages, so an inserted setLocale is visible to the dynamic-usage scan", () => {
        const plugins = cloudflareNextIntl();
        const localeParamsIndex = plugins.findIndex((p) => p.name === "cloudflare-next-intl-auto-locale-params");
        const dynamicPagesIndex = plugins.findIndex((p) => p.name === "cloudflare-next-intl-auto-dynamic-pages");
        expect(localeParamsIndex).toBeLessThan(dynamicPagesIndex);
    });

    it("allows disabling specific plugins", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(0);
    });

    it("supports custom buildIdAsset filename", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: "CUSTOM_BUILD_ID",
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cfni:build-id-asset");
    });

    it("supports custom imageOptimizer configuration", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: {
                maxWidth: 1200,
                formats: ["webp"],
            },
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: false,
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
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cloudflare-next-intl-auto-dynamic-pages");
    });

    it("supports custom autoLocaleParams configuration", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: {
                mode: "report",
                localeParam: "lang",
            },
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cloudflare-next-intl-auto-locale-params");
    });

    it("supports vinextRouteWiringFix enabled exclusively", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: true,
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cfni:vinext-route-wiring-fix");
    });

    it("supports vinextRouteWiringFix with sub-option overrides", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: { routeMatching: false },
            localeFiles: false,
            lucideOptimizer: false,
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cfni:vinext-route-wiring-fix");
    });

    it("supports lucideOptimizer with custom options", () => {
        const plugins = cloudflareNextIntl({
            autoDynamicPages: false,
            autoLocaleParams: false,
            imageOptimizer: false,
            buildIdAsset: false,
            cfWorkersClientStub: false,
            userAgentStub: false,
            vinextRouteWiringFix: false,
            localeFiles: false,
            lucideOptimizer: { normalizeNextJsImports: false },
        });

        expect(plugins.length).toBe(1);
        expect(plugins[0].name).toBe("cloudflare-next-intl-lucide-optimizer");
    });

    it("exports plugin aliases and index exports", () => {
        expect(cloudflareNextIntlPlugin).toBe(cloudflareNextIntl);
        expect(viteIndex.cloudflareNextIntl).toBe(cloudflareNextIntl);
        expect(viteIndex.default).toBe(cloudflareNextIntl);
        expect(typeof viteIndex.autoDynamicPagesPlugin).toBe("function");
        expect(typeof viteIndex.autoLocaleParamsPlugin).toBe("function");
        expect(typeof viteIndex.imageOptimizer).toBe("function");
        expect(typeof viteIndex.imageOptimizerPlugin).toBe("function");
        expect(typeof viteIndex.buildIdAsset).toBe("function");
        expect(typeof viteIndex.localeFilePlugin).toBe("function");
        expect(typeof viteIndex.userAgentStubPlugin).toBe("function");
        expect(typeof viteIndex.cfWorkersClientStubPlugin).toBe("function");
        expect(typeof viteIndex.vinextRouteWiringFixPlugin).toBe("function");
        expect(typeof viteIndex.lucideOptimizerPlugin).toBe("function");
    });
});
