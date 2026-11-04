import { describe, it, expect } from "vitest";
import {
    rolldownRuntimeStubPlugin,
    ROLLDOWN_RUNTIME_STUB_ID,
    ROLLDOWN_RUNTIME_STUB_CODE,
} from "./rolldown_runtime_stub.js";

describe("rolldownRuntimeStubPlugin", () => {
    it("has correct plugin metadata", () => {
        const plugin = rolldownRuntimeStubPlugin();
        expect(plugin.name).toBe("cfni:rolldown-runtime-stub");
        expect(plugin.enforce).toBe("pre");
    });

    it("resolves _virtual/_rolldown/runtime.js in client environment to virtual ID", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const resolveId = plugin.resolveId as Function;

        const ctxClient = { environment: { name: "client" } };
        const resolvedClient = resolveId.call(
            ctxClient,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            undefined,
            {},
        );
        expect(resolvedClient).toBe(ROLLDOWN_RUNTIME_STUB_ID);

        const ctxSsr = { environment: { name: "ssr" } };
        const resolvedSsr = resolveId.call(
            ctxSsr,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            undefined,
            {},
        );
        expect(resolvedSsr).toBeUndefined();
    });

    it("loads stub code without node:module import", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const load = plugin.load as Function;

        const content = load.call({}, ROLLDOWN_RUNTIME_STUB_ID);
        expect(content).toBe(ROLLDOWN_RUNTIME_STUB_CODE);
        expect(content).not.toContain("node:module");
        expect(content).toContain("var __require = () => {};");
    });

    it("loads stub code when id directly matches in client environment", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const load = plugin.load as Function;

        const ctxClient = { environment: { name: "client" } };
        const content = load.call(
            ctxClient,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(content).toBe(ROLLDOWN_RUNTIME_STUB_CODE);
    });
});

