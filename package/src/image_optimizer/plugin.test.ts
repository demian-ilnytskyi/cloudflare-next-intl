import { describe, it, expect, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getShimPath, imageOptimizerPlugin, VIRTUAL_IMAGE_SHIM_ID, VIRTUAL_MANIFEST_ID } from "./plugin.js";
import { makeTempDir, cleanup } from "../test_utils/image_optimizer_test_helpers.js";

describe("imageOptimizerPlugin", () => {
    it("has expected name and enforce pre, with no apply restriction — resolveId/load must answer in dev too", () => {
        const plugin = imageOptimizerPlugin();
        expect(plugin.name).toBe("cloudflare-next-intl-image-optimizer");
        expect(plugin.enforce).toBe("pre");
        // Deliberately no `apply` gate: `next_image_shim.tsx` unconditionally
        // imports the virtual manifest module regardless of dev/build, so
        // `resolveId`/`load` must be registered in every environment or a dev
        // server 500s with "Failed to resolve import ... Does the file exist?"
        // for every page importing `next/image`. Only the actual optimizer
        // SCAN (`buildStart`) is dev/build-gated — see the tests below.
        expect(plugin.apply).toBeUndefined();
    });

    it("resolveId/load answer the virtual manifest ID even in dev (command: 'serve'), dev: false (the default)", () => {
        const plugin = imageOptimizerPlugin({ manifest: "missing-manifest.json" });
        const configResolved = plugin.configResolved as (config: { command: string }) => void;
        configResolved({ command: "serve" });

        const resolved = (plugin.resolveId as (id: string) => string | undefined)(VIRTUAL_MANIFEST_ID);
        expect(resolved).toBe("\0" + VIRTUAL_MANIFEST_ID);
        // No manifest file exists at this path — resolveId/load still answer
        // (not "undefined", which is what a dev-disabled plugin would do and
        // is exactly the bug this test guards against) with the clean
        // empty-manifest fallback.
        const loaded = (plugin.load as (id: string) => string | undefined)("\0" + VIRTUAL_MANIFEST_ID);
        expect(loaded).toContain("images: {}");
    });

    it("skips the buildStart optimizer scan during dev (command: 'serve') unless dev: true is passed", async () => {
        const plugin = imageOptimizerPlugin({ dirs: [] });
        const configResolved = plugin.configResolved as (config: { command: string }) => void;
        configResolved({ command: "serve" });

        const mockContext = { info: vi.fn() };
        const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
        await buildStart.call(mockContext);
        expect(mockContext.info).not.toHaveBeenCalled();
    });

    it("runs the buildStart optimizer scan during dev when dev: true is passed explicitly", async () => {
        const plugin = imageOptimizerPlugin({ dirs: [], dev: true });
        const configResolved = plugin.configResolved as (config: { command: string }) => void;
        configResolved({ command: "serve" });

        const mockContext = { info: vi.fn() };
        const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
        await buildStart.call(mockContext);
        expect(mockContext.info).toHaveBeenCalled();
    });

    it("runs the buildStart optimizer scan during a real build (command: 'build') regardless of dev option", async () => {
        const plugin = imageOptimizerPlugin({ dirs: [] });
        const configResolved = plugin.configResolved as (config: { command: string }) => void;
        configResolved({ command: "build" });

        const mockContext = { info: vi.fn() };
        const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
        await buildStart.call(mockContext);
        expect(mockContext.info).toHaveBeenCalled();
    });

    it("resolves virtual image shim ID and checks getShimPath with .js", async () => {
        const root = await makeTempDir();
        const jsFile = path.join(root, "next_image_shim.js");
        await writeFile(jsFile, "export default {};");
        expect(getShimPath(root)).toBe(jsFile);

        const plugin = imageOptimizerPlugin();
        const resolved = (plugin.resolveId as (id: string) => string | undefined)(VIRTUAL_IMAGE_SHIM_ID);
        expect(resolved).toBeDefined();
        expect(resolved?.endsWith("next_image_shim.tsx") || resolved?.endsWith("next_image_shim.js")).toBe(true);

        const otherResolved = (plugin.resolveId as (id: string) => string | undefined)("other-id");
        expect(otherResolved).toBeUndefined();

        await cleanup(root);
    });

    it("resolves virtual manifest ID and loads default and custom manifest", async () => {
        const root = await makeTempDir();
        const manifestFile = path.join(root, "public", "generated", "images.json");
        await mkdir(path.dirname(manifestFile), { recursive: true });
        await writeFile(manifestFile, JSON.stringify({ images: { "/a.png": {} } }));

        const plugin = imageOptimizerPlugin({ manifest: path.relative(process.cwd(), manifestFile) });
        const resolved = (plugin.resolveId as (id: string) => string | undefined)(VIRTUAL_MANIFEST_ID);
        expect(resolved).toBe("\0" + VIRTUAL_MANIFEST_ID);

        const loaded = (plugin.load as (id: string) => string | undefined)("\0" + VIRTUAL_MANIFEST_ID);
        expect(loaded).toContain("/a.png");

        const missingPlugin = imageOptimizerPlugin({ manifest: "missing-manifest.json" });
        const loadedMissing = (missingPlugin.load as (id: string) => string | undefined)("\0" + VIRTUAL_MANIFEST_ID);
        expect(loadedMissing).toContain("export default { images: {} }");

        const loadedOther = (plugin.load as (id: string) => string | undefined)("other-id");
        expect(loadedOther).toBeUndefined();

        await cleanup(root);
    });

    it("transforms next/image imports to virtual image shim ID and skips when disabled or shim itself", () => {
        const plugin = imageOptimizerPlugin();
        const transform = plugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;

        const code = `import Image from "next/image";\nexport function Component() { return <Image src="/a.png" />; }`;
        const result = transform(code, "/src/app/page.tsx");
        expect(result).toBeDefined();
        expect(result?.code).toContain(`import Image from "${VIRTUAL_IMAGE_SHIM_ID}";`);

        const shimPath = getShimPath();
        expect(transform(code, shimPath)).toBeUndefined();

        const nodeModulesResult = transform(code, "/node_modules/pkg/index.js");
        expect(nodeModulesResult).toBeUndefined();

        const noMatchCode = `const x = 1;`;
        expect(transform(noMatchCode, "/src/app/page.tsx")).toBeUndefined();

        const typeImport = `import type { ImageProps } from "next/image";`;
        const typeResult = transform(typeImport, "/src/app/page.tsx");
        expect(typeResult).toBeUndefined();

        const disabledPlugin = imageOptimizerPlugin({ enabled: false });
        const disabledTransform = disabledPlugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;
        expect(disabledTransform(code, "/src/app/page.tsx")).toBeUndefined();
    });

    it("runs buildStart and logs info", async () => {
        const root = await makeTempDir();
        const plugin = imageOptimizerPlugin({ dirs: [] });
        const mockContext = {
            info: vi.fn(),
        };

        const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
        await buildStart.call(mockContext);
        expect(mockContext.info).toHaveBeenCalled();

        const disabledPlugin = imageOptimizerPlugin({ enabled: false });
        const disabledBuildStart = disabledPlugin.buildStart as (this: typeof mockContext) => Promise<void>;
        await disabledBuildStart.call(mockContext);

        await cleanup(root);
    });
});
