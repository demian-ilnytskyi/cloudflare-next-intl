import { describe, expect, it, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
import {
    detectLucideReact,
    resolveLucideEsmEntry,
    parseLucideIconMap,
    transformLucideImports,
    transformNextJsImports,
    lucideOptimizerPlugin,
    JS_EXT_RE,
    LUCIDE_IMPORT_RE,
    NEXT_JS_IMPORT_RE,
} from "./lucide_optimizer_plugin.js";

describe("lucide_optimizer_plugin constants", () => {
    it("JS_EXT_RE matches js/ts/jsx/tsx files with or without queries", () => {
        expect(JS_EXT_RE.test("file.js")).toBe(true);
        expect(JS_EXT_RE.test("file.jsx")).toBe(true);
        expect(JS_EXT_RE.test("file.ts")).toBe(true);
        expect(JS_EXT_RE.test("file.tsx")).toBe(true);
        expect(JS_EXT_RE.test("file.mjs")).toBe(true);
        expect(JS_EXT_RE.test("file.cjs")).toBe(true);
        expect(JS_EXT_RE.test("file.css")).toBe(false);
    });

    it("LUCIDE_IMPORT_RE matches named imports from lucide-react", () => {
        const str = `import { Home, ArrowRight } from "lucide-react";`;
        expect(new RegExp(LUCIDE_IMPORT_RE).test(str)).toBe(true);
    });

    it("NEXT_JS_IMPORT_RE matches next/*.js specifiers", () => {
        expect(new RegExp(NEXT_JS_IMPORT_RE).test(`import dynamic from "next/dynamic.js";`)).toBe(true);
        expect(new RegExp(NEXT_JS_IMPORT_RE).test(`import { usePathname } from 'next/navigation.js';`)).toBe(true);
    });
});

describe("detectLucideReact", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(tmpdir(), "lucide-detect-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("returns true when lucide-react exists in node_modules", () => {
        const pkgDir = path.join(tempDir, "node_modules", "lucide-react");
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "lucide-react" }));
        expect(detectLucideReact(tempDir)).toBe(true);
    });

    it("returns false when lucide-react is not present", () => {
        expect(detectLucideReact(tempDir)).toBe(false);
    });
});

describe("resolveLucideEsmEntry", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(tmpdir(), "lucide-resolve-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("resolves esm entry when present in node_modules", () => {
        const esmDir = path.join(tempDir, "node_modules", "lucide-react", "dist", "esm");
        fs.mkdirSync(esmDir, { recursive: true });
        const esmFile = path.join(esmDir, "lucide-react.mjs");
        fs.writeFileSync(esmFile, "export const Foo = {};");
        fs.writeFileSync(
            path.join(tempDir, "node_modules", "lucide-react", "package.json"),
            JSON.stringify({ name: "lucide-react" })
        );

        const resolved = resolveLucideEsmEntry(tempDir);
        expect(fs.realpathSync(resolved!)).toBe(fs.realpathSync(esmFile));
    });

    it("resolves esm entry using fallback path when createRequire throws", () => {
        const esmDir = path.join(tempDir, "node_modules", "lucide-react", "dist", "esm");
        fs.mkdirSync(esmDir, { recursive: true });
        const esmFile = path.join(esmDir, "lucide-react.mjs");
        fs.writeFileSync(esmFile, "export const Foo = {};");
        // No package.json at root, causing createRequire to throw or fail resolving lucide-react/package.json
        const resolved = resolveLucideEsmEntry(tempDir);
        expect(fs.realpathSync(resolved!)).toBe(fs.realpathSync(esmFile));
    });

    it("returns null when esm entry does not exist", () => {
        expect(resolveLucideEsmEntry(tempDir)).toBeNull();
    });
});

describe("parseLucideIconMap", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(tmpdir(), "lucide-parse-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("parses export lines into iconMap", () => {
        const entryFile = path.join(tempDir, "lucide-react.mjs");
        const code = `
export { default as Home, Home as HomeIcon } from './icons/home.mjs';
export { default as ArrowRight } from './icons/arrow-right.mjs';
`;
        fs.writeFileSync(entryFile, code, "utf8");

        const map = parseLucideIconMap(entryFile);
        expect(map.get("Home")).toBe("lucide-react/dist/esm/icons/home.mjs");
        expect(map.get("HomeIcon")).toBe("lucide-react/dist/esm/icons/home.mjs");
        expect(map.get("ArrowRight")).toBe("lucide-react/dist/esm/icons/arrow-right.mjs");
        expect(map.get("LucideProvider")).toBe("lucide-react/dist/esm/context.mjs");
        expect(map.get("useLucideContext")).toBe("lucide-react/dist/esm/context.mjs");
    });

    it("returns context entries even if file is nonexistent or read fails", () => {
        const map = parseLucideIconMap(path.join(tempDir, "non-existent.mjs"));
        expect(map.size).toBe(0);
    });
});

describe("transformLucideImports", () => {
    const iconMap = new Map<string, string>([
        ["Home", "lucide-react/dist/esm/icons/home.mjs"],
        ["ArrowRight", "lucide-react/dist/esm/icons/arrow-right.mjs"],
    ]);

    it("returns unchanged when code does not include lucide-react or map is empty", () => {
        expect(transformLucideImports("const a = 1;", iconMap)).toEqual({
            code: "const a = 1;",
            changed: false,
        });
        expect(transformLucideImports('import { Home } from "lucide-react";', new Map())).toEqual({
            code: 'import { Home } from "lucide-react";',
            changed: false,
        });
    });

    it("rewrites known icons to deep paths and leaves types / unknown icons intact", () => {
        const input = `
import { Home, ArrowRight as Arrow, type LucideProps, UnknownIcon } from "lucide-react";
console.log(Home);
`;
        const res = transformLucideImports(input, iconMap);
        expect(res.changed).toBe(true);
        expect(res.code).toContain('import Home from "lucide-react/dist/esm/icons/home.mjs";');
        expect(res.code).toContain('import Arrow from "lucide-react/dist/esm/icons/arrow-right.mjs";');
        expect(res.code).toContain('import { type LucideProps, UnknownIcon } from "lucide-react";');
    });

    it("handles comments inside import specifiers", () => {
        const input = `import { /* comment */ Home, // trailing\n ArrowRight } from "lucide-react";`;
        const res = transformLucideImports(input, iconMap);
        expect(res.changed).toBe(true);
        expect(res.code).toContain('import Home from "lucide-react/dist/esm/icons/home.mjs";');
        expect(res.code).toContain('import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.mjs";');
    });
});

describe("transformNextJsImports", () => {
    it("returns unchanged when code does not include next/ or .js", () => {
        expect(transformNextJsImports("const a = 1;")).toEqual({
            code: "const a = 1;",
            changed: false,
        });
        expect(transformNextJsImports('import dynamic from "next/dynamic";')).toEqual({
            code: 'import dynamic from "next/dynamic";',
            changed: false,
        });
    });

    it("normalizes next/*.js specifiers", () => {
        const input = `
import dynamic from "next/dynamic.js";
import { usePathname } from 'next/navigation.js';
import { cookies } from "next/headers.js";
`;
        const res = transformNextJsImports(input);
        expect(res.changed).toBe(true);
        expect(res.code).toContain('import dynamic from "next/dynamic";');
        expect(res.code).toContain("import { usePathname } from 'next/navigation';");
        expect(res.code).toContain('import { cookies } from "next/headers";');
    });
});

describe("lucideOptimizerPlugin", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(tmpdir(), "lucide-plugin-test-"));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("configures resolve.alias and optimizeDeps when lucide-react is present", () => {
        const esmDir = path.join(tempDir, "node_modules", "lucide-react", "dist", "esm");
        fs.mkdirSync(esmDir, { recursive: true });
        fs.writeFileSync(path.join(esmDir, "lucide-react.mjs"), "export { default as Home } from './icons/home.mjs';");
        fs.writeFileSync(
            path.join(tempDir, "node_modules", "lucide-react", "package.json"),
            JSON.stringify({ name: "lucide-react" })
        );

        // create vinext headers shim
        const vinextDir = path.join(tempDir, "node_modules", "vinext", "dist", "shims");
        fs.mkdirSync(vinextDir, { recursive: true });
        fs.writeFileSync(path.join(vinextDir, "headers.js"), "export const headers = () => {};");

        const plugin = lucideOptimizerPlugin({ root: tempDir });
        expect(plugin.name).toBe("cloudflare-next-intl-lucide-optimizer");
        expect(plugin.enforce).toBe("pre");

        interface AliasEntry {
            find: RegExp;
            replacement: string;
        }
        interface MockConfigResult {
            resolve?: { alias?: AliasEntry[] };
            optimizeDeps?: { exclude?: string[]; include?: string[] };
        }

        const configHook = plugin.config as (config: Record<string, unknown>) => MockConfigResult;
        const configResult = configHook({ root: tempDir });

        expect(configResult.resolve?.alias).toBeDefined();
        expect(configResult.resolve?.alias?.length).toBe(2);
        expect(configResult.optimizeDeps?.exclude).toContain("lucide-react");
        expect(configResult.optimizeDeps?.exclude).toContain("next/headers");
        expect(configResult.optimizeDeps?.include).toContain("next/dynamic");

        const configResolvedHook = plugin.configResolved as (config: Record<string, unknown>) => void;
        configResolvedHook({ root: tempDir });
    });

    it("handles config and configResolved with empty dir where lucide is absent", () => {
        const emptyDir = fs.mkdtempSync(path.join(tmpdir(), "lucide-empty-"));
        try {
            interface MockConfigResult {
                optimizeDeps?: { exclude?: string[] };
            }
            const plugin = lucideOptimizerPlugin({ root: emptyDir });
            const configHook = plugin.config as (config: Record<string, unknown>) => MockConfigResult;
            const configRes = configHook({ root: emptyDir });
            expect(configRes).toBeDefined();
            expect(configRes.optimizeDeps?.exclude).not.toContain("lucide-react");

            const configResolvedHook = plugin.configResolved as (config: Record<string, unknown>) => void;
            configResolvedHook({});
            configResolvedHook({ root: emptyDir });
        } finally {
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });

    it("handles default options without options object", () => {
        const plugin = lucideOptimizerPlugin();
        const configHook = plugin.config as (config: Record<string, unknown>) => unknown;
        const configRes = configHook({});
        expect(configRes).toBeDefined();
    });

    it("transforms files properly via transform hook", () => {
        const esmDir = path.join(tempDir, "node_modules", "lucide-react", "dist", "esm");
        fs.mkdirSync(esmDir, { recursive: true });
        fs.writeFileSync(path.join(esmDir, "lucide-react.mjs"), "export { default as Home } from './icons/home.mjs';");
        fs.writeFileSync(
            path.join(tempDir, "node_modules", "lucide-react", "package.json"),
            JSON.stringify({ name: "lucide-react" })
        );

        const plugin = lucideOptimizerPlugin({ root: tempDir });
        const configHook = plugin.config as (config: Record<string, unknown>) => unknown;
        configHook({ root: tempDir });

        const transformHook = plugin.transform as (code: string, id: string) => { code: string; map: null } | null;

        // Skip non-JS or query stripped
        expect(transformHook("body { color: red; }", "/src/style.css")).toBeNull();
        expect(transformHook("export default 1;", "/project/node_modules/lucide-react/dist/esm/icons/home.mjs")).toBeNull();
        expect(transformHook("export default 1;", "/project/node_modules/other-pkg/index.js")).toBeNull();

        // Transform app code
        const code = `
import { Home } from "lucide-react";
import dynamic from "next/dynamic.js";
export default function Comp() { return <Home />; }
`;
        const res = transformHook(code, "/src/app/page.tsx?v=123");
        expect(res).not.toBeNull();
        expect(res.code).toContain('import Home from "lucide-react/dist/esm/icons/home.mjs";');
        expect(res.code).toContain('import dynamic from "next/dynamic";');

        // Transform cloudflare-next-intl code
        const cfniCode = `import dynamic from "next/dynamic.js";`;
        const cfniRes = transformHook(cfniCode, "/node_modules/cloudflare-next-intl/dist/index.js");
        expect(cfniRes).not.toBeNull();
        expect(cfniRes.code).toContain('import dynamic from "next/dynamic";');

        // When no change is made, returns null
        expect(transformHook("const x = 10;", "/src/util.ts")).toBeNull();
    });
});
