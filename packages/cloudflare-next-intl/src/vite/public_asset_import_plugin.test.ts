import { describe, it, expect } from "vitest";
import {
    publicAssetImportPlugin,
    PUBLIC_ASSET_IMPORT_PREFIX,
} from "./public_asset_import_plugin.js";

describe("publicAssetImportPlugin", () => {
    it("intercepts relative /public/ asset imports and returns virtual id", () => {
        const plugin = publicAssetImportPlugin();
        const resolveId = plugin.resolveId as ((this: unknown, id: string) => unknown);

        const resolved = resolveId.call({}, "../../../../public/marketing/shared/logo.svg");
        expect(resolved).toBe(`${PUBLIC_ASSET_IMPORT_PREFIX}/marketing/shared/logo.svg`);
    });

    it("ignores non-asset imports or paths without /public/", () => {
        const plugin = publicAssetImportPlugin();
        const resolveId = plugin.resolveId as ((this: unknown, id: string) => unknown);

        expect(resolveId.call({}, "./components/button.tsx")).toBeUndefined();
        expect(resolveId.call({}, "../../../../public/something.ts")).toBeUndefined();
    });

    it("loads virtual asset module exporting root-relative path", () => {
        const plugin = publicAssetImportPlugin();
        const load = plugin.load as ((this: unknown, id: string) => unknown);

        const result = load.call({}, `${PUBLIC_ASSET_IMPORT_PREFIX}/marketing/shared/logo.svg`);
        expect(result).toBe('export default "/marketing/shared/logo.svg";');
    });
});

