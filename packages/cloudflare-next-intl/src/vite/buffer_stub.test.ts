import { describe, expect, it } from "vitest";
import { bufferStubPlugin, BUFFER_STUB_ID } from "./buffer_stub.js";

describe("bufferStubPlugin", () => {
    it("resolves node:buffer and leaves buffer unintercepted for client environment", () => {
        const plugin = bufferStubPlugin();
        const resolveId = plugin.resolveId as (...args: unknown[]) => unknown;

        const clientContext = { environment: { name: "client" } };
        expect(resolveId.call(clientContext, "node:buffer", undefined, {})).toBe(BUFFER_STUB_ID);
        expect(resolveId.call(clientContext, "buffer", undefined, {})).toBeUndefined();

        const ssrFalseContext = {};
        expect(resolveId.call(ssrFalseContext, "node:buffer", undefined, { ssr: false })).toBe(BUFFER_STUB_ID);
    });

    it("ignores node:buffer for ssr or rsc environments", () => {
        const plugin = bufferStubPlugin();
        const resolveId = plugin.resolveId as (...args: unknown[]) => unknown;

        const ssrContext = { environment: { name: "ssr" } };
        expect(resolveId.call(ssrContext, "node:buffer", undefined, { ssr: true })).toBeUndefined();

        const rscContext = { environment: { name: "rsc" } };
        expect(resolveId.call(rscContext, "node:buffer", undefined, {})).toBeUndefined();
    });

    it("loads buffer stub code for BUFFER_STUB_ID", () => {
        const plugin = bufferStubPlugin();
        const load = plugin.load as (...args: unknown[]) => unknown;

        const loaded = load(BUFFER_STUB_ID) as string;
        expect(loaded).toContain('import bufferModule, { Buffer } from "buffer"');
        expect(loaded).toContain("export { Buffer }");
        expect(loaded).toContain("export default bufferModule");
        expect(load("other-id")).toBeUndefined();
    });

    it("provides config hook with optimizeDeps.include for buffer", () => {
        const plugin = bufferStubPlugin();
        const configFn = plugin.config as (...args: unknown[]) => unknown;
        const config = configFn() as { optimizeDeps?: { include?: string[] } };
        expect(config.optimizeDeps?.include).toContain("buffer");
    });
});
