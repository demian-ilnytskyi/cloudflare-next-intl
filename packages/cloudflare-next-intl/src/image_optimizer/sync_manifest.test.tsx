import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { imageOptimizerPlugin, injectSyncVirtualImports, redirectCdnCgiRemoteImage, rewriteCdnCgiImage } from "./plugin.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shimSource = path.join(dir, "next_image_shim.tsx");
const clientSource = path.join(dir, "next_image_client.tsx");
const tempFiles: string[] = [];

const arrow = { src: "/images/hero.png", alt: "arrow", width: 24, height: 24 };

type ImageFn = (props: typeof arrow) => { props: { src: unknown } };

async function loadTransformed(source: string, name: string): Promise<Record<string, unknown>> {
    const code = injectSyncVirtualImports(readFileSync(source, "utf8"), source);
    expect(code).toBeDefined();
    const file = path.join(dir, `${name}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp.tsx`);
    writeFileSync(file, code!);
    tempFiles.push(file);
    return import(/* @vite-ignore */ file);
}

describe("image shim reads the manifest before the first render", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterAll(() => {
        for (const file of tempFiles) rmSync(file, { force: true });
    });

    it("without the plugin, the first render falls back to the original src", async () => {
        const { default: Image } = await import("./next_image_shim.js");
        expect((Image as unknown as ImageFn)(arrow).props.src).toBe("/images/hero.png");
    });

    it("with the plugin transform, the first render already uses the optimized src", async () => {
        const mod = await loadTransformed(shimSource, "next_image_shim");
        const Image = mod.default as ImageFn;
        expect(Image(arrow).props.src).toBe("/generated/images/hero.webp");
    });

    it("with the plugin transform, the client module applies the loader while it evaluates", async () => {
        const loader = vi.fn(({ src }: { src: string }) => `${src}?cdn`);
        vi.doMock("virtual:cloudflare-next-intl-image-loader", () => ({ defaultLoader: loader, default: loader }));
        const mod = await loadTransformed(clientSource, "next_image_client");
        const { createElement } = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const Client = mod.NextImageClient as (props: typeof arrow) => React.JSX.Element;
        const html = renderToStaticMarkup(createElement(Client, arrow));
        vi.doUnmock("virtual:cloudflare-next-intl-image-loader");
        expect(loader).toHaveBeenCalled();
        expect(html).toContain("?cdn");
    });
});

describe("injectSyncVirtualImports", () => {
    const shimCode = "export function applyManifestModule(){}\nexport function applyLoaderModule(){}\n";

    it("adds static virtual imports to the built shim, query string included", () => {
        const out = injectSyncVirtualImports(
            shimCode,
            "/app/node_modules/cloudflare-next-intl/dist/src/image_optimizer/next_image_shim.js?v=abc",
        );
        expect(out).toContain('import * as __cfniManifestModule from "virtual:cloudflare-next-intl-images-manifest"');
        expect(out).toContain('import * as __cfniLoaderModule from "virtual:cloudflare-next-intl-image-loader"');
        expect(out).toContain("applyManifestModule(__cfniManifestModule);");
    });

    it("adds the static loader import to the built client", () => {
        const out = injectSyncVirtualImports(
            "export function applyLoaderModule(){}\n",
            "C:\\app\\node_modules\\cloudflare-next-intl\\dist\\src\\image_optimizer\\next_image_client.js",
        );
        expect(out).toContain("applyLoaderModule(__cfniLoaderModule);");
        expect(out).not.toContain("images-manifest");
    });

    it("is applied by the plugin transform, also with the optimizer disabled", () => {
        const plugin = imageOptimizerPlugin({ enabled: false });
        const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;
        const out = transform(shimCode, "/app/node_modules/cloudflare-next-intl/dist/src/image_optimizer/next_image_shim.js");
        expect(out?.code).toContain("applyLoaderModule(__cfniLoaderModule);");
    });

    it("leaves other modules and older shims without the hooks untouched", () => {
        expect(injectSyncVirtualImports(shimCode, "/app/src/next_image_shim.tsx")).toBeUndefined();
        expect(injectSyncVirtualImports("export default 1;", "/x/image_optimizer/next_image_shim.js")).toBeUndefined();
        expect(injectSyncVirtualImports("export default 1;", "/x/image_optimizer/next_image_client.js")).toBeUndefined();
    });
});

describe("rewriteCdnCgiImage", () => {
    it.each([
        ["/cdn-cgi/image/width=160,format=auto,quality=75/generated/images/logo.webp", "/generated/images/logo.webp"],
        ["/cdn-cgi/image/width=auto/images/a b.png?x=1", "/images/a b.png?x=1"],
        ["/cdn-cgi/image/width=160/https://cdn.example.com/a.png", "/cdn-cgi/image/width=160/https://cdn.example.com/a.png"],
        ["/cdn-cgi/image/width=160//cdn.example.com/a.png", "/cdn-cgi/image/width=160//cdn.example.com/a.png"],
        ["/images/a.png", "/images/a.png"],
    ])("%s -> %s", (url, expected) => {
        const req = { url };
        rewriteCdnCgiImage(req);
        expect(req.url).toBe(expected);
    });

    it("also rewrites originalUrl, which the Cloudflare preview server forwards", () => {
        const req = { url: "/cdn-cgi/image/width=160/images/a.png", originalUrl: "/cdn-cgi/image/width=160/images/a.png" };
        rewriteCdnCgiImage(req);
        expect(req.originalUrl).toBe("/images/a.png");
    });

    it("leaves a request without url alone", () => {
        const req: { url?: string } = {};
        rewriteCdnCgiImage(req);
        expect(req.url).toBeUndefined();
    });

    it("redirects a remote image to its source and leaves local ones to the rewrite", () => {
        const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
        expect(redirectCdnCgiRemoteImage({ url: "/cdn-cgi/image/width=160,format=auto/https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media" }, res)).toBe(true);
        expect(res.statusCode).toBe(302);
        expect(res.setHeader).toHaveBeenCalledWith("Location", "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media");
        expect(res.end).toHaveBeenCalledOnce();

        const untouched = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
        expect(redirectCdnCgiRemoteImage({ url: "/cdn-cgi/image/width=160/images/a.png" }, untouched)).toBe(false);
        expect(redirectCdnCgiRemoteImage({}, untouched)).toBe(false);
        expect(untouched.end).not.toHaveBeenCalled();
    });

    it("redirects remote images from both the dev and the preview server", () => {
        const plugin = imageOptimizerPlugin();
        for (const hook of [plugin.configureServer, plugin.configurePreviewServer]) {
            let middleware: ((req: { url?: string }, res: unknown, next: () => void) => void) | undefined;
            (hook as (server: unknown) => void)({ middlewares: { use: (fn: typeof middleware) => { middleware = fn; } } });
            const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
            const next = vi.fn();
            middleware!({ url: "/cdn-cgi/image/width=160/http://cdn.example.com/a.png" }, res, next);
            expect(res.statusCode).toBe(302);
            expect(next).not.toHaveBeenCalled();
        }
    });

    it("is served by both the dev and the preview server", () => {
        const plugin = imageOptimizerPlugin();
        for (const hook of [plugin.configureServer, plugin.configurePreviewServer]) {
            let middleware: ((req: { url?: string }, res: unknown, next: () => void) => void) | undefined;
            (hook as (server: unknown) => void)({ middlewares: { use: (fn: typeof middleware) => { middleware = fn; } } });
            const req = { url: "/cdn-cgi/image/width=160/images/a.png" };
            const next = vi.fn();
            middleware!(req, {}, next);
            expect(req.url).toBe("/images/a.png");
            expect(next).toHaveBeenCalledOnce();
        }
    });
});
