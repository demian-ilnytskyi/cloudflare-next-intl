import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { localeFilePlugin, resolveDefaultIntlConfigPath, getCfniDistSrcDir } from "./locale_file_plugin.js";

type ConfigResolvedFn = (config: { root?: string }) => void;
interface ResolveIdContext { environment?: { name: string } }
type ResolveIdFn = (this: ResolveIdContext, id: string) => string | undefined;
type LoadFn = (id: string) => string | undefined;
type TransformFn = (code: string, id: string) => { code: string; map: null } | undefined;

describe("localeFilePlugin", () => {
    it("resolves default intl config path using existing candidate or fallback", () => {
        const root = process.cwd();
        const existsSpy = vi.spyOn(fs, "existsSync");

        existsSpy.mockReturnValueOnce(true);
        const existing = resolveDefaultIntlConfigPath(root);
        expect(existing).toBe(path.join(root, "src", "l18n", "intl_config.ts"));

        existsSpy.mockReturnValue(false);
        const fallback = resolveDefaultIntlConfigPath(root);
        expect(fallback).toBe(path.join(root, "src", "l18n", "intl_config.ts"));

        existsSpy.mockRestore();
    });

    it("resolves cfni dist src dir with different roots", () => {
        const portfolioRoot = path.resolve(process.cwd(), "..", "..", "portfolio");

        // 1. When cloudflare-next-intl is installed in node_modules
        const detected = getCfniDistSrcDir(portfolioRoot);
        expect(detected).toBeDefined();
        expect(detected.endsWith("/dist/src")).toBe(true);

        // 2. When require.resolve fails (invalid root)
        const invalidRoot = "/invalid/root/path";
        const fallbackDir = getCfniDistSrcDir(invalidRoot);
        expect(fallbackDir).toBe(path.join(invalidRoot, "node_modules", "cloudflare-next-intl", "dist", "src").replace(/\\/g, "/"));
    });

    it("has correct plugin metadata", () => {
        const plugin = localeFilePlugin();
        expect(plugin.name).toBe("cfni:locale-file");
        expect(plugin.enforce).toBe("pre");
    });

    it("handles configResolved hook with and without root", () => {
        const plugin = localeFilePlugin();
        const configResolved = plugin.configResolved as ConfigResolvedFn;
        expect(() => configResolved({ root: "/my-app" })).not.toThrow();
        expect(() => configResolved({})).not.toThrow();

        const customPlugin = localeFilePlugin({
            messagesDir: "/custom/messages",
            intlConfigPath: "/custom/intl.ts",
            root: "/my-custom-root",
        });
        const customConfigResolved = customPlugin.configResolved as ConfigResolvedFn;
        expect(() => customConfigResolved({ root: "/my-app" })).not.toThrow();

        const relPlugin = localeFilePlugin({
            messagesDir: "./rel/messages",
            intlConfigPath: "./rel/intl.ts",
        });
        const relConfigResolved = relPlugin.configResolved as ConfigResolvedFn;
        expect(() => relConfigResolved({ root: "/my-app" })).not.toThrow();
    });

    it("resolves @locale-file/* paths", () => {
        const plugin = localeFilePlugin({ messagesDir: "./custom_messages", root: "/test-root" });
        const resolveId = plugin.resolveId as ResolveIdFn;

        const resolved = resolveId.call({}, "@locale-file/en.json");
        expect(resolved).toBe(path.join("/test-root", "custom_messages", "en.json"));
    });

    it("resolves @intl-config path", () => {
        const plugin = localeFilePlugin({ intlConfigPath: "/custom/intl_config.ts" });
        const resolveId = plugin.resolveId as ResolveIdFn;

        expect(resolveId.call({}, "@intl-config")).toBe("/custom/intl_config.ts");
    });

    it("resolves cloudflare-next-intl in rsc environment", () => {
        const plugin = localeFilePlugin();
        const resolveId = plugin.resolveId as ResolveIdFn;

        const rscContext = { environment: { name: "rsc" } };
        expect(resolveId.call(rscContext, "cloudflare-next-intl")).toBe("\0cloudflare-next-intl:rsc");

        const clientContext = { environment: { name: "client" } };
        expect(resolveId.call(clientContext, "cloudflare-next-intl")).toBeUndefined();
    });

    it("loads virtual rsc module", () => {
        const plugin = localeFilePlugin();
        const load = plugin.load as LoadFn;

        const rscCode = load("\0cloudflare-next-intl:rsc");
        expect(rscCode).toContain("/config/index.js");
        expect(rscCode).toContain("/server/index.js");
        expect(load("other-module")).toBeUndefined();
    });

    it("transforms dynamic locale imports in cloudflare-next-intl", () => {
        const plugin = localeFilePlugin();
        const transform = plugin.transform as TransformFn;

        const inputCode = `
const messages = (await import(\`@locale-file/\${locale}.json\`)).default;
`;
        const result = transform(inputCode, "/path/to/node_modules/cloudflare-next-intl/dist/src/server/functions/server.js");
        expect(result).toBeDefined();
        expect(result.code).toContain("import.meta.glob");
        expect(result.code).toContain("__cfni_locales__");

        const noMatch = transform(inputCode, "/path/to/my-code.js");
        expect(noMatch).toBeUndefined();

        const noLocaleCode = `console.log("hello");`;
        const noTransform = transform(noLocaleCode, "/path/to/cloudflare-next-intl/test.js");
        expect(noTransform).toBeUndefined();
    });
});
