import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    autoImageLoaderPlugin,
    detectImageLoader,
    findExportedLoaderName,
    generateLoaderVirtualModule,
    DEFAULT_LOADER_CANDIDATES,
    VIRTUAL_IMAGE_LOADER_ID,
    RESOLVED_IMAGE_LOADER_ID,
    type DetectedImageLoader,
} from "./auto_image_loader_plugin.js";
import { cloudflareNextIntl } from "./plugin.js";
import { VIRTUAL_IMAGE_SHIM_ID, getShimPath } from "../image_optimizer/plugin.js";

describe("auto_image_loader_plugin", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-image-loader-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    });

    describe("findExportedLoaderName", () => {
        it("finds default export function", () => {
            const code = `
                // comments
                export default function myImageLoader({ src, width, quality }: any) {
                    return \`\${src}?w=\${width}\`;
                }
            `;
            expect(findExportedLoaderName(code)).toBe("default");
        });

        it("finds default export arrow or identifier", () => {
            const code = `
                const loader = ({ src }: any) => src;
                export default loader;
            `;
            expect(findExportedLoaderName(code)).toBe("default");
        });

        it("finds default export re-export: export { custom as default }", () => {
            const code = `export { custom as default };`;
            expect(findExportedLoaderName(code)).toBe("default");
        });

        it("finds named export function", () => {
            const code = `
                /* multi line
                   comment */
                export function customImageLoader({ src }: any) {
                    return src;
                }
            `;
            expect(findExportedLoaderName(code)).toBe("customImageLoader");
        });

        it("finds named export async function", () => {
            const code = `export async function asyncLoader({ src }: any) { return src; }`;
            expect(findExportedLoaderName(code)).toBe("asyncLoader");
        });

        it("finds named const export", () => {
            const code = `export const imageLoader = ({ src, width }: any) => \`\${src}?w=\${width}\`;`;
            expect(findExportedLoaderName(code)).toBe("imageLoader");
        });

        it("finds named let or var export", () => {
            expect(findExportedLoaderName(`export let letLoader = () => "";`)).toBe("letLoader");
            expect(findExportedLoaderName(`export var varLoader = () => "";`)).toBe("varLoader");
        });

        it("finds named export from export list", () => {
            const code = `
                function internalLoader() {}
                export { internalLoader as myCustomLoader };
            `;
            expect(findExportedLoaderName(code)).toBe("myCustomLoader");

            const codeSimple = `export { directLoader };`;
            expect(findExportedLoaderName(codeSimple)).toBe("directLoader");
        });

        it("returns null when no export exists or file is only comments", () => {
            expect(findExportedLoaderName("// just comments\n/* more comments */")).toBeNull();
            expect(findExportedLoaderName("const a = 123;")).toBeNull();
        });

        it("respects preferredExportName when specified", () => {
            const code = `
                export function fallbackLoader() {}
                export const customLoader = () => {};
                export default function main() {}
            `;
            expect(findExportedLoaderName(code, "default")).toBe("default");
            expect(findExportedLoaderName(code, "fallbackLoader")).toBe("fallbackLoader");
            expect(findExportedLoaderName(code, "customLoader")).toBe("customLoader");
            expect(findExportedLoaderName(code, "missingExport")).toBeNull();
            expect(findExportedLoaderName("export const other = 1;", "default")).toBeNull();
        });

        it("respects preferredExportName for re-exports and let/var", () => {
            const code = `
                let myLet = 1;
                var myVar = 2;
                export let targetLet = 1;
                export var targetVar = 2;
                export { something as targetReExport };
            `;
            expect(findExportedLoaderName(code, "targetLet")).toBe("targetLet");
            expect(findExportedLoaderName(code, "targetVar")).toBe("targetVar");
            expect(findExportedLoaderName(code, "targetReExport")).toBe("targetReExport");
        });
    });

    describe("detectImageLoader", () => {
        it("finds default image-loader.ts in root", () => {
            const filePath = path.join(tempDir, "image-loader.ts");
            fs.writeFileSync(filePath, "export default function({ src }: any) { return src; }");

            const detected = detectImageLoader({ root: tempDir });
            expect(detected.exists).toBe(true);
            expect(detected.isEmpty).toBe(false);
            expect(detected.loaderPath).toBe(filePath);
            expect(detected.exportName).toBe("default");
        });

        it("finds fallback candidates such as src/image-loader.js", () => {
            const srcDir = path.join(tempDir, "src");
            fs.mkdirSync(srcDir);
            const filePath = path.join(srcDir, "image-loader.js");
            fs.writeFileSync(filePath, "export const imageLoader = ({ src }) => src;");

            const detected = detectImageLoader({ root: tempDir });
            expect(detected.exists).toBe(true);
            expect(detected.loaderPath).toBe(filePath);
            expect(detected.exportName).toBe("imageLoader");
        });

        it("supports custom relative or absolute file option", () => {
            const customPath = path.join(tempDir, "custom-loader.mjs");
            fs.writeFileSync(customPath, "export function customFn() {}");

            const relativeResult = detectImageLoader({ root: tempDir, file: "custom-loader.mjs" });
            expect(relativeResult.exists).toBe(true);
            expect(relativeResult.loaderPath).toBe(customPath);
            expect(relativeResult.exportName).toBe("customFn");

            const absoluteResult = detectImageLoader({ root: tempDir, file: customPath });
            expect(absoluteResult.exists).toBe(true);
            expect(absoluteResult.loaderPath).toBe(customPath);
        });

        it("returns inactive result when specified file does not exist", () => {
            const result = detectImageLoader({ root: tempDir, file: "non-existent-file.ts" });
            expect(result.exists).toBe(false);
            expect(result.loaderPath).toBeNull();
            expect(result.exportName).toBeNull();
        });

        it("returns inactive result when no default candidate exists in root", () => {
            const result = detectImageLoader({ root: tempDir });
            expect(result.exists).toBe(false);
            expect(result.loaderPath).toBeNull();
            expect(result.exportName).toBeNull();
        });

        it("handles empty file or whitespace/comments-only file gracefully", () => {
            const filePath = path.join(tempDir, "image-loader.ts");
            fs.writeFileSync(filePath, "   \n // empty \n /* */ \n");

            const result = detectImageLoader({ root: tempDir });
            expect(result.exists).toBe(true);
            expect(result.isEmpty).toBe(true);
            expect(result.loaderPath).toBe(filePath);
            expect(result.exportName).toBeNull();
        });

        it("passes custom exportName option through", () => {
            const filePath = path.join(tempDir, "image-loader.ts");
            fs.writeFileSync(filePath, "export const a = 1;\nexport const b = 2;");

            const result = detectImageLoader({ root: tempDir, exportName: "b" });
            expect(result.exists).toBe(true);
            expect(result.exportName).toBe("b");
        });
    });

    describe("generateLoaderVirtualModule", () => {
        it("generates empty module when loader not detected or empty", () => {
            const inactive: DetectedImageLoader = {
                exists: false,
                isEmpty: false,
                loaderPath: null,
                exportName: null,
            };
            const code = generateLoaderVirtualModule(inactive);
            expect(code).toContain("export const defaultLoader = undefined;");
            expect(code).toContain("export const hasCustomLoader = false;");

            const emptyFile: DetectedImageLoader = {
                exists: true,
                isEmpty: true,
                loaderPath: "/path/to/file.ts",
                exportName: null,
            };
            expect(generateLoaderVirtualModule(emptyFile)).toContain("export const hasCustomLoader = false;");
        });

        it("generates default export module code", () => {
            const detected: DetectedImageLoader = {
                exists: true,
                isEmpty: false,
                loaderPath: "/project/image-loader.ts",
                exportName: "default",
            };
            const code = generateLoaderVirtualModule(detected);
            expect(code).toContain('import loader from "/project/image-loader.ts";');
            expect(code).toContain("export const defaultLoader = loader;");
            expect(code).toContain("export const hasCustomLoader = true;");
            expect(code).toContain("export default loader;");
        });

        it("generates named export module code", () => {
            const detected: DetectedImageLoader = {
                exists: true,
                isEmpty: false,
                loaderPath: "/project/image-loader.ts",
                exportName: "myCustomLoader",
            };
            const code = generateLoaderVirtualModule(detected);
            expect(code).toContain('import { myCustomLoader as loader } from "/project/image-loader.ts";');
            expect(code).toContain("export const defaultLoader = loader;");
            expect(code).toContain("export const hasCustomLoader = true;");
        });

        it("normalizes Windows backslashes in paths", () => {
            const detected: DetectedImageLoader = {
                exists: true,
                isEmpty: false,
                loaderPath: "C:\\project\\image-loader.ts",
                exportName: "default",
            };
            const code = generateLoaderVirtualModule(detected);
            expect(code).toContain('import loader from "C:/project/image-loader.ts";');
        });
    });

    describe("autoImageLoaderPlugin lifecycle", () => {
        it("provides correct name and enforce values", () => {
            const plugin = autoImageLoaderPlugin();
            expect(plugin.name).toBe("cloudflare-next-intl-auto-image-loader");
            expect(plugin.enforce).toBe("pre");
        });

        it("resolves virtual module IDs", () => {
            const plugin = autoImageLoaderPlugin();
            const resolveId = plugin.resolveId as (id: string) => string | undefined;

            expect(resolveId(VIRTUAL_IMAGE_LOADER_ID)).toBe(RESOLVED_IMAGE_LOADER_ID);
            expect(resolveId(VIRTUAL_IMAGE_SHIM_ID)).toBe(getShimPath());
            expect(resolveId("other-module")).toBeUndefined();
        });

        it("loads virtual module content when loader exists", () => {
            const filePath = path.join(tempDir, "image-loader.ts");
            fs.writeFileSync(filePath, "export default function customLoader() {}");

            const plugin = autoImageLoaderPlugin({ root: tempDir });
            const load = plugin.load as (id: string) => string | undefined;

            const content = load(RESOLVED_IMAGE_LOADER_ID);
            expect(content).toBeTruthy();
            expect(content).toContain("export const hasCustomLoader = true;");
            expect(load("other-module")).toBeUndefined();
        });

        it("returns empty export when enabled=false in plugin load", () => {
            const plugin = autoImageLoaderPlugin({ enabled: false });
            const load = plugin.load as (id: string) => string | undefined;

            const content = load(RESOLVED_IMAGE_LOADER_ID);
            expect(content).toContain("export const defaultLoader = undefined;");
            expect(content).toContain("export const hasCustomLoader = false;");
        });

        it("transforms next/image imports in user application files", () => {
            const plugin = autoImageLoaderPlugin();
            const transform = plugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;

            const userCode = `import Image from "next/image";\nexport function Component() { return <Image src="/a.png" />; }`;
            const result = transform(userCode, "/app/src/page.tsx");
            expect(result).toBeDefined();
            expect(result?.code).toContain(`import Image from "${VIRTUAL_IMAGE_SHIM_ID}";`);

            // skips node_modules
            expect(transform(userCode, "/app/node_modules/pkg/index.js")).toBeUndefined();

            // skips shim itself
            expect(transform(userCode, getShimPath())).toBeUndefined();

            // skips files without next/image
            expect(transform(`import React from "react";`, "/app/src/page.tsx")).toBeUndefined();

            // skips type-only imports
            const typeOnly = `import type { ImageProps } from "next/image";`;
            expect(transform(typeOnly, "/app/src/page.tsx")).toBeUndefined();
        });

        it("skips transform when enabled=false", () => {
            const plugin = autoImageLoaderPlugin({ enabled: false });
            const transform = plugin.transform as (code: string, id: string) => { code: string; map: null } | undefined;

            const userCode = `import Image from "next/image";`;
            expect(transform(userCode, "/app/src/page.tsx")).toBeUndefined();
        });
    });

    describe("cloudflareNextIntl integration", () => {
        it("includes autoImageLoaderPlugin by default", () => {
            const plugins = cloudflareNextIntl();
            const loaderPlugin = plugins.find((p) => p.name === "cloudflare-next-intl-auto-image-loader");
            expect(loaderPlugin).toBeDefined();
        });

        it("excludes autoImageLoaderPlugin when autoImageLoader: false", () => {
            const plugins = cloudflareNextIntl({ autoImageLoader: false });
            const loaderPlugin = plugins.find((p) => p.name === "cloudflare-next-intl-auto-image-loader");
            expect(loaderPlugin).toBeUndefined();
        });

        it("passes options object to autoImageLoaderPlugin", () => {
            const filePath = path.join(tempDir, "custom-loader.ts");
            fs.writeFileSync(filePath, "export const myLoader = () => {};");

            const plugins = cloudflareNextIntl({
                autoImageLoader: {
                    root: tempDir,
                    file: "custom-loader.ts",
                    exportName: "myLoader",
                },
            });
            const loaderPlugin = plugins.find((p) => p.name === "cloudflare-next-intl-auto-image-loader");
            expect(loaderPlugin).toBeDefined();

            const load = loaderPlugin!.load as (id: string) => string | undefined;
            const content = load(RESOLVED_IMAGE_LOADER_ID);
            expect(content).toContain("myLoader as loader");
        });
    });
});
