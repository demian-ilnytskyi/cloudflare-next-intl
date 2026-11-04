import { describe, it, expect, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
    getShimPath,
    imageOptimizerPlugin,
    VIRTUAL_IMAGE_SHIM_ID,
    VIRTUAL_MANIFEST_ID,
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
} from "./index.js";
import { makeTempDir, cleanup, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

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

    it("resolves and loads virtual image loader ID with fallback or custom loader", async () => {
        const plugin = imageOptimizerPlugin();
        const resolved = (plugin.resolveId as (id: string) => string | undefined)(VIRTUAL_IMAGE_LOADER_ID);
        expect(resolved).toBe(RESOLVED_IMAGE_LOADER_ID);

        const loaded = (plugin.load as (id: string) => string | undefined)(RESOLVED_IMAGE_LOADER_ID);
        expect(loaded).toContain("export const defaultLoader = undefined;");

        const disabledPlugin = imageOptimizerPlugin({ autoImageLoader: false });
        const loadedDisabled = (disabledPlugin.load as (id: string) => string | undefined)(RESOLVED_IMAGE_LOADER_ID);
        expect(loadedDisabled).toContain("export const defaultLoader = undefined;");

        const root = await makeTempDir();
        const loaderFile = path.join(root, "image-loader.ts");
        await writeFile(loaderFile, "export default function customLoader({ src }: { src: string }) { return src; }");

        const customPlugin = imageOptimizerPlugin({ autoImageLoader: { root } });
        const loadedCustom = (customPlugin.load as (id: string) => string | undefined)(RESOLVED_IMAGE_LOADER_ID);
        expect(loadedCustom).toContain("export const hasCustomLoader = true;");

        await cleanup(root);
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
        // `run()` defaults to `onlyUsed: true`, which scans `process.cwd()`'s
        // `public/` dir for actually-referenced images; without isolating cwd
        // to an empty temp dir, this scans the whole real package directory
        // (node_modules included) and can blow past the test timeout.
        const root = await makeTempDir();
        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            const plugin = imageOptimizerPlugin({ dirs: [], dev: true });
            const configResolved = plugin.configResolved as (config: { command: string }) => void;
            configResolved({ command: "serve" });

            const mockContext = { info: vi.fn() };
            const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
            await buildStart.call(mockContext);
            expect(mockContext.info).toHaveBeenCalled();
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });

    it("runs the buildStart optimizer scan during a real build (command: 'build') regardless of dev option", async () => {
        const root = await makeTempDir();
        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            const plugin = imageOptimizerPlugin({ dirs: [] });
            const configResolved = plugin.configResolved as (config: { command: string }) => void;
            configResolved({ command: "build" });

            const mockContext = { info: vi.fn() };
            const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
            await buildStart.call(mockContext);
            expect(mockContext.info).toHaveBeenCalled();
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
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
        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
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

            // Corrupt manifest file error handling in buildStart
            const corruptManifest = path.join(root, "public", "corrupt.json");
            await writeFile(corruptManifest, "invalid json");
            const corruptPlugin = imageOptimizerPlugin({ manifest: path.relative(root, corruptManifest), dirs: [] });
            await (corruptPlugin.buildStart as (this: typeof mockContext) => Promise<void>).call(mockContext);
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });

    it("transforms metadata image urls during build when optimizeMetadata is enabled", async () => {
        const root = await makeTempDir();
        await writeFixturePng(path.join(root, "public", "images"), "og.png", 50, 50);

        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            const plugin = imageOptimizerPlugin({
                dirs: ["public/images"],
                optimizeMetadata: true,
            });
            const configResolved = plugin.configResolved as (config: { command: string }) => void;
            configResolved({ command: "build" });

            const mockContext = { info: vi.fn() };
            const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
            await buildStart.call(mockContext);

            const transform = plugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;
            const code = `export const metadata = { openGraph: { images: ["/images/og.png"] } };`;
            const result = transform(code, path.join(root, "src", "app", "page.tsx"));
            expect(result).toBeDefined();
            expect(result?.code).toContain("/generated/images/og");
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });

    it("handles pruning in buildStart and closeBundle", async () => {
        const root = await makeTempDir();
        const clientDir = path.join(root, "dist", "client", "images");
        const customOutDir = path.join(root, "out-assets", "images");
        await mkdir(clientDir, { recursive: true });
        await mkdir(customOutDir, { recursive: true });

        const clientImg = path.join(clientDir, "hero.png");
        const customImg = path.join(customOutDir, "hero.png");
        const bigContent = "x".repeat(1024 * 1024 + 10);
        await writeFile(clientImg, bigContent);
        await writeFile(customImg, "small");

        const publicImages = path.join(root, "public", "images");
        await writeFixturePng(publicImages, "hero.png", 50, 50);

        const srcDir = path.join(root, "src");
        await mkdir(srcDir, { recursive: true });
        await writeFile(path.join(srcDir, "page.tsx"), '<Image src="/images/hero.png" />');

        const manifestFile = path.join(root, "public", "generated", "images.json");
        await mkdir(path.dirname(manifestFile), { recursive: true });
        await writeFile(manifestFile, JSON.stringify({ images: { "/images/hero.png": { src: "/generated/images/hero.webp" } } }));

        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            const plugin = imageOptimizerPlugin({
                manifest: path.relative(root, manifestFile),
                pruneOriginalsFromBuild: true,
            });
            const configResolved = plugin.configResolved as (config: { command: string; build?: { outDir: string } }) => void;
            configResolved({ command: "build", build: { outDir: "out-assets" } });

            const mockContext = { info: vi.fn(), warn: vi.fn() };
            const buildStart = plugin.buildStart as (this: typeof mockContext) => Promise<void>;
            await buildStart.call(mockContext);

            const closeBundle = plugin.closeBundle as (this: typeof mockContext) => void;
            closeBundle.call(mockContext);
            expect(mockContext.info).toHaveBeenCalled();

            // Early returns in closeBundle:
            // 1. command !== 'build'
            const devPlugin = imageOptimizerPlugin({ pruneOriginalsFromBuild: true });
            (devPlugin.configResolved as (config: { command: string }) => void)({ command: "serve" });
            (devPlugin.closeBundle as (this: typeof mockContext) => void).call(mockContext);

            // 2. pruneOriginalsFromBuild is false
            const noPrunePlugin = imageOptimizerPlugin({ pruneOriginalsFromBuild: false });
            (noPrunePlugin.configResolved as (config: { command: string }) => void)({ command: "build" });
            (noPrunePlugin.closeBundle as (this: typeof mockContext) => void).call(mockContext);

            // 3. outDirs.size === 0 and outDir ending with server/dist
            const emptyOutPlugin = imageOptimizerPlugin({ pruneOriginalsFromBuild: true });
            (emptyOutPlugin.configResolved as (config: { command: string; build?: { outDir: string } }) => void)({ command: "build", build: { outDir: "dist/server" } });
            (emptyOutPlugin.closeBundle as (this: typeof mockContext) => void).call(mockContext);

            // 4. kB size branch and prunedFiles.length === 0 branch
            (plugin.closeBundle as (this: typeof mockContext) => void).call(mockContext);

            // 5. small file pruned (kB branch)
            await mkdir(clientDir, { recursive: true });
            await writeFile(clientImg, "small file");
            (plugin.closeBundle as (this: object) => void).call({});

            // 6. closeBundle on empty prunable list or unbuilt project
            const emptyRoot = path.join(root, "empty-project");
            cwdSpy.mockReturnValue(emptyRoot);
            const unbuiltPlugin = imageOptimizerPlugin({ pruneOriginalsFromBuild: true });
            (unbuiltPlugin.configResolved as (config: { command: string }) => void)({ command: "build" });
            (unbuiltPlugin.closeBundle as (this: object) => void).call({});
            (unbuiltPlugin.transform as (code: string, id: string) => void)("const x = 1;", "/src/test.tsx");
            cwdSpy.mockReturnValue(root);

            // 7. outDirs.size === 0 when dist/client does not exist
            await rm(path.join(root, "dist"), { recursive: true, force: true });
            await rm(path.join(root, "out-assets"), { recursive: true, force: true });
            (plugin.closeBundle as (this: typeof mockContext) => void).call(mockContext);
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });

    it("rewrites /_next/image and /_vinext/image urls in dev middleware", () => {
        const plugin = imageOptimizerPlugin();
        let middleware: ((req: { url?: string }, res: unknown, next: () => void) => void) | undefined;
        const mockServer = {
            middlewares: {
                use: vi.fn((fn: (req: { url?: string }, res: unknown, next: () => void) => void) => {
                    middleware = fn;
                }),
            },
        };

        const configureServer = plugin.configureServer as (server: typeof mockServer) => void;
        configureServer(mockServer);
        expect(mockServer.middlewares.use).toHaveBeenCalled();
        expect(middleware).toBeDefined();

        const req1 = { url: "/_next/image?url=%2Fstatic%2Flogo.png" };
        const next1 = vi.fn();
        middleware!(req1, {}, next1);
        expect(req1.url).toBe("/static/logo.png");
        expect(next1).toHaveBeenCalled();

        const req2 = { url: "/_vinext/image?url=%2Fstatic%2Fhero.png" };
        const next2 = vi.fn();
        middleware!(req2, {}, next2);
        expect(req2.url).toBe("/static/hero.png");
        expect(next2).toHaveBeenCalled();

        const req3 = { url: "/_next/image" };
        const next3 = vi.fn();
        middleware!(req3, {}, next3);
        expect(req3.url).toBe("/_next/image");
        expect(next3).toHaveBeenCalled();

        const origURL = globalThis.URL;
        globalThis.URL = class extends origURL {
            constructor(url: string | URL, base?: string | URL) {
                if (typeof url === "string" && url.includes("throw-error")) {
                    throw new Error("url parsing failure");
                }
                super(url, base);
            }
        };
        try {
            const reqError = { url: "/_next/image?throw-error=true" };
            const nextError = vi.fn();
            middleware!(reqError, {}, nextError);
            expect(nextError).toHaveBeenCalled();
        } finally {
            globalThis.URL = origURL;
        }

        const req5 = { url: "/api/hello" };
        const next5 = vi.fn();
        middleware!(req5, {}, next5);
        expect(req5.url).toBe("/api/hello");
        expect(next5).toHaveBeenCalled();

        const req6 = {};
        const next6 = vi.fn();
        middleware!(req6, {}, next6);
        expect(next6).toHaveBeenCalled();
    });

    it("skips metadata transform during dev when dev: false", async () => {
        const root = await makeTempDir();
        await writeFixturePng(path.join(root, "public", "images"), "og.png", 50, 50);

        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            const plugin = imageOptimizerPlugin({
                dirs: ["public/images"],
                optimizeMetadata: true,
                dev: false,
            });
            const configResolved = plugin.configResolved as (config: { command: string }) => void;
            configResolved({ command: "serve" });

            const transform = plugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;
            const code = `export const metadata = { openGraph: { images: ["/images/og.png"] } };`;
            const result = transform(code, path.join(root, "src", "app", "page.tsx"));
            expect(result).toBeUndefined();
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });
});

