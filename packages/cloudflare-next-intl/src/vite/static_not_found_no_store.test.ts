import { describe, it, expect } from "vitest";
import { appendStaticNoStoreRule, staticNotFoundNoStorePlugin, STATIC_NO_STORE_RULE } from "./static_not_found_no_store.js";

type TransformFn = (code: string, id: string) => { code: string; map: null } | undefined;

const userRule = { source: "/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] };

describe("appendStaticNoStoreRule", () => {
    it("appends the rule last in both generated config header literals", () => {
        const code = [
            `  configHeaders: ${JSON.stringify([userRule])},`,
            `const __configHeaders = ${JSON.stringify([userRule])};`,
            `  configHeaders: __configHeaders,`,
        ].join("\n");

        const out = appendStaticNoStoreRule(code).split("\n");

        expect(out[0]).toBe(`  configHeaders: ${JSON.stringify([userRule, STATIC_NO_STORE_RULE])},`);
        expect(out[1]).toBe(`const __configHeaders = ${JSON.stringify([userRule, STATIC_NO_STORE_RULE])};`);
        expect(out[2]).toBe(`  configHeaders: __configHeaders,`);
    });

    it("adds the rule when the app has no headers", () => {
        expect(appendStaticNoStoreRule(`const __configHeaders = [];`)).toBe(
            `const __configHeaders = ${JSON.stringify([STATIC_NO_STORE_RULE])};`,
        );
    });
});

describe("staticNotFoundNoStorePlugin", () => {
    const plugin = staticNotFoundNoStorePlugin();
    const transform = plugin.transform as TransformFn;

    it("has correct plugin metadata", () => {
        expect(plugin.name).toBe("cfni:static-not-found-no-store");
    });

    it("patches vinext virtual entries", () => {
        expect(transform(`const __configHeaders = [];`, "\0virtual:vinext-rsc-entry")?.code).toContain("/_next/static/:path*");
    });

    it("ignores other modules and entries without header literals", () => {
        expect(transform(`const __configHeaders = [];`, "/src/app/page.tsx")).toBeUndefined();
        expect(transform(`export default 1;`, "\0virtual:vinext-rsc-entry")).toBeUndefined();
    });
});
