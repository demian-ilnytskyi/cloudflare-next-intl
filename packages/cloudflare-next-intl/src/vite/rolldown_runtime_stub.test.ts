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
        const resolveId = plugin.resolveId as ((this: unknown, id: string, importer?: string, options?: unknown) => unknown);

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

        const ctxRsc = { environment: { name: "rsc" } };
        const resolvedRsc = resolveId.call(
            ctxRsc,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            undefined,
            {},
        );
        expect(resolvedRsc).toBeUndefined();

        const resolvedSsrOpt = resolveId.call(
            {},
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            undefined,
            { ssr: true },
        );
        expect(resolvedSsrOpt).toBeUndefined();

        const resolvedNonSsr = resolveId.call(
            {},
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            undefined,
            { ssr: false },
        );
        expect(resolvedNonSsr).toBe(ROLLDOWN_RUNTIME_STUB_ID);
    });

    it("loads stub code without node:module import", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const load = plugin.load as ((this: unknown, id: string) => unknown);

        const content = load.call({}, ROLLDOWN_RUNTIME_STUB_ID);
        expect(content).toBe(ROLLDOWN_RUNTIME_STUB_CODE);
        expect(content).not.toContain("node:module");
        expect(content).toContain("var __require = () => {};");
    });

    it("loads stub code when id directly matches in client environment", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const load = plugin.load as ((this: unknown, id: string) => unknown);

        const ctxClient = { environment: { name: "client" } };
        const content = load.call(
            ctxClient,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(content).toBe(ROLLDOWN_RUNTIME_STUB_CODE);

        const ctxSsr = { environment: { name: "ssr" } };
        const contentSsr = load.call(
            ctxSsr,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(contentSsr).toBeUndefined();

        const ctxRsc = { environment: { name: "rsc" } };
        const contentRsc = load.call(
            ctxRsc,
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(contentRsc).toBeUndefined();
    });

    it("transforms runtime.js in client or non-ssr environment", () => {
        const plugin = rolldownRuntimeStubPlugin();
        const transform = plugin.transform as ((this: unknown, code: string, id: string, options?: { ssr?: boolean }) => { code: string; map: null } | undefined);

        const ctxClient = { environment: { name: "client" } };
        const resultClient = transform.call(
            ctxClient,
            "const orig = 1;",
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(resultClient).toEqual({
            code: ROLLDOWN_RUNTIME_STUB_CODE,
            map: null,
        });

        const ctxSsr = { environment: { name: "ssr" } };
        const resultSsr = transform.call(
            ctxSsr,
            "const orig = 1;",
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            { ssr: true },
        );
        expect(resultSsr).toBeUndefined();

        const ctxRsc = { environment: { name: "rsc" } };
        const resultRsc = transform.call(
            ctxRsc,
            "const orig = 1;",
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
        );
        expect(resultRsc).toBeUndefined();

        const resultSsrOpt = transform.call(
            {},
            "const orig = 1;",
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            { ssr: true },
        );
        expect(resultSsrOpt).toBeUndefined();

        const resultNonSsr = transform.call(
            {},
            "const orig = 1;",
            "/app/node_modules/vinext/dist/_virtual/_rolldown/runtime.js",
            { ssr: false },
        );
        expect(resultNonSsr).toBeDefined();

        const resultOther = transform.call(
            ctxClient,
            "const orig = 1;",
            "/app/src/other.js",
        );
        expect(resultOther).toBeUndefined();
    });
});

