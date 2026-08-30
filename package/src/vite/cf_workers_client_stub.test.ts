import { describe, it, expect } from "vitest";
import { cfWorkersClientStubPlugin, CF_WORKERS_CLIENT_STUB_ID, CF_WORKERS_CLIENT_STUB_CODE } from "./cf_workers_client_stub.js";

describe("cfWorkersClientStubPlugin", () => {
    it("has correct plugin metadata", () => {
        const plugin = cfWorkersClientStubPlugin();
        expect(plugin.name).toBe("cfni:cf-workers-client-stub");
        expect(plugin.enforce).toBe("pre");
    });

    it("resolves cloudflare:workers in client environment", () => {
        const plugin = cfWorkersClientStubPlugin();
        const resolveId = plugin.resolveId as any;

        const clientContext = { environment: { name: "client" } };
        expect(resolveId.call(clientContext, "cloudflare:workers", undefined, {})).toBe(CF_WORKERS_CLIENT_STUB_ID);

        const ssrFalseContext = {};
        expect(resolveId.call(ssrFalseContext, "cloudflare:workers", undefined, { ssr: false })).toBe(CF_WORKERS_CLIENT_STUB_ID);

        const serverContext = { environment: { name: "server" } };
        expect(resolveId.call(serverContext, "cloudflare:workers", undefined, { ssr: true })).toBeUndefined();

        expect(resolveId.call(clientContext, "other-module", undefined, {})).toBeUndefined();
    });

    it("loads virtual cloudflare:workers client stub module code", () => {
        const plugin = cfWorkersClientStubPlugin();
        const load = plugin.load as any;

        expect(load(CF_WORKERS_CLIENT_STUB_ID)).toBe(CF_WORKERS_CLIENT_STUB_CODE);
        expect(load("other-module")).toBeUndefined();
    });
});
