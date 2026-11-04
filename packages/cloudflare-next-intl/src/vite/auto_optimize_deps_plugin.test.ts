import { describe, it, expect } from "vitest";
import {
    autoOptimizeDepsPlugin,
    DEFAULT_OPTIMIZE_DEPS_INCLUDE,
    DEFAULT_OPTIMIZE_DEPS_EXCLUDE,
    DEFAULT_DEDUPE,
} from "./auto_optimize_deps_plugin.js";

describe("autoOptimizeDepsPlugin", () => {
    it("returns correct default optimizeDeps configuration", () => {
        const plugin = autoOptimizeDepsPlugin();
        const configFn = plugin.config as (() => { resolve?: { dedupe?: string[] }; optimizeDeps?: { include?: string[]; exclude?: string[] } });
        const config = configFn();

        expect(config?.resolve?.dedupe).toEqual(DEFAULT_DEDUPE);
        expect(config?.optimizeDeps?.include).toEqual(DEFAULT_OPTIMIZE_DEPS_INCLUDE);
        expect(config?.optimizeDeps?.exclude).toEqual(DEFAULT_OPTIMIZE_DEPS_EXCLUDE);
    });

    it("allows adding custom include and exclude items", () => {
        const plugin = autoOptimizeDepsPlugin({
            include: ["custom-pkg"],
            exclude: ["custom-exclude"],
        });
        const configFn = plugin.config as (() => { optimizeDeps?: { include?: string[]; exclude?: string[] } });
        const config = configFn();

        expect(config?.optimizeDeps?.include).toContain("custom-pkg");
        expect(config?.optimizeDeps?.exclude).toContain("custom-exclude");
        expect(config?.optimizeDeps?.include).toContain("react");
    });

    it("returns undefined when enabled is false", () => {
        const plugin = autoOptimizeDepsPlugin({ enabled: false });
        const configFn = plugin.config as (() => unknown);
        const config = configFn();

        expect(config).toBeUndefined();
    });
});

