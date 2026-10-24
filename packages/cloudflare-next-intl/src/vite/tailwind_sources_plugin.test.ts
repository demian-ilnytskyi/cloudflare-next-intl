import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    findDependencyDir,
    findPackageRoot,
    injectTailwindSources,
    resolveTailwindSourceDirs,
    tailwindSourcesPlugin,
} from "./tailwind_sources_plugin.js";

type TransformFn = (code: string, id: string) => { code: string; map: null } | undefined;

let tmp: string;
let cfniRoot: string;
let themeDir: string;

function writePkg(dir: string, pkg: object): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
}

beforeAll(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cfni-tw-")));
    cfniRoot = join(tmp, "app", "node_modules", "cloudflare-next-intl");
    themeDir = join(tmp, "app", "node_modules", "cloudflare-next-intl-theme");
    writePkg(cfniRoot, {
        name: "cloudflare-next-intl",
        dependencies: { "cloudflare-next-intl-theme": "^0.1.0", "cloudflare-next-intl-auth": "^0.2.0", react: "^19.0.0" },
    });
    writePkg(themeDir, { name: "cloudflare-next-intl-theme" });
    writePkg(join(cfniRoot, "node_modules", "cloudflare-next-intl-auth"), { name: "cloudflare-next-intl-auth" });
    mkdirSync(join(cfniRoot, "dist", "src", "vite"), { recursive: true });
    writePkg(join(tmp, "nopkg"), {});
});

afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
});

describe("findPackageRoot", () => {
    it("walks up to the package with the given name", () => {
        expect(findPackageRoot(join(cfniRoot, "dist", "src", "vite"), "cloudflare-next-intl")).toBe(cfniRoot);
    });

    it("returns undefined when no ancestor matches", () => {
        expect(findPackageRoot(join(tmp, "nopkg"), "cloudflare-next-intl")).toBeUndefined();
    });
});

describe("findDependencyDir", () => {
    it("prefers a nested node_modules copy", () => {
        expect(findDependencyDir(cfniRoot, "cloudflare-next-intl-auth")).toBe(join(cfniRoot, "node_modules", "cloudflare-next-intl-auth"));
    });

    it("finds a hoisted copy in an ancestor node_modules", () => {
        expect(findDependencyDir(cfniRoot, "cloudflare-next-intl-theme")).toBe(themeDir);
    });

    it("returns undefined when the dependency is not installed", () => {
        expect(findDependencyDir(cfniRoot, "cloudflare-next-intl-missing")).toBeUndefined();
    });
});

describe("resolveTailwindSourceDirs", () => {
    it("returns the package root and its installed cloudflare-next-intl-* dependencies only", () => {
        expect(resolveTailwindSourceDirs(join(cfniRoot, "dist", "src", "vite"))).toEqual([
            cfniRoot,
            themeDir,
            join(cfniRoot, "node_modules", "cloudflare-next-intl-auth"),
        ]);
    });

    it("skips sub-packages that are not installed", () => {
        const root = join(tmp, "partial", "cloudflare-next-intl");
        writePkg(root, { name: "cloudflare-next-intl", dependencies: { "cloudflare-next-intl-errors": "^0.1.0" } });
        expect(resolveTailwindSourceDirs(root)).toEqual([root]);
    });

    it("handles a package.json without dependencies", () => {
        const root = join(tmp, "bare", "cloudflare-next-intl");
        writePkg(root, { name: "cloudflare-next-intl" });
        expect(resolveTailwindSourceDirs(root)).toEqual([root]);
    });

    it("returns an empty list outside cloudflare-next-intl", () => {
        expect(resolveTailwindSourceDirs(join(tmp, "nopkg"))).toEqual([]);
    });

    it("resolves this package by default", () => {
        expect(resolveTailwindSourceDirs()[0]).toMatch(/cloudflare-next-intl$/);
    });
});

describe("injectTailwindSources", () => {
    const css = join(tmp ?? "/", "app", "src", "app", "globals.css");

    it("inserts relative @source lines right after the tailwindcss import", () => {
        const file = join(tmp, "app", "src", "app", "globals.css");
        const out = injectTailwindSources(`@import "tailwindcss";\n\n.a{}`, file, [cfniRoot, themeDir]);
        expect(out).toBe(
            `@import "tailwindcss";\n@source "../../node_modules/cloudflare-next-intl/";\n@source "../../node_modules/cloudflare-next-intl-theme/";\n\n.a{}`,
        );
    });

    it("supports single quotes and import modifiers", () => {
        const out = injectTailwindSources(`@import 'tailwindcss' source(none);`, "/a/b.css", ["/a/x"]);
        expect(out).toBe(`@import 'tailwindcss' source(none);\n@source "x/";`);
    });

    it("returns undefined without a tailwindcss import", () => {
        expect(injectTailwindSources(`.a{}`, css, ["/a/x"])).toBeUndefined();
    });

    it("returns undefined when there are no directories", () => {
        expect(injectTailwindSources(`@import "tailwindcss";`, css, [])).toBeUndefined();
    });
});

describe("tailwindSourcesPlugin", () => {
    it("has correct plugin metadata", () => {
        const plugin = tailwindSourcesPlugin();
        expect(plugin.name).toBe("cfni:tailwind-sources");
        expect(plugin.enforce).toBe("pre");
    });

    it("injects into css modules and strips query strings", () => {
        const transform = tailwindSourcesPlugin({ dirs: ["/a/x"] }).transform as TransformFn;
        expect(transform(`@import "tailwindcss";`, "/a/b.css?direct")).toEqual({ code: `@import "tailwindcss";\n@source "x/";`, map: null });
    });

    it("ignores non-css modules", () => {
        const transform = tailwindSourcesPlugin({ dirs: ["/a/x"] }).transform as TransformFn;
        expect(transform(`@import "tailwindcss";`, "/a/b.ts")).toBeUndefined();
    });

    it("ignores css without a tailwindcss import", () => {
        const transform = tailwindSourcesPlugin({ dirs: ["/a/x"] }).transform as TransformFn;
        expect(transform(`.a{}`, "/a/b.css")).toBeUndefined();
    });

    it("resolves directories lazily when none are given", () => {
        const transform = tailwindSourcesPlugin().transform as TransformFn;
        expect(transform(`@import "tailwindcss";`, "/a/b.css")?.code).toMatch(/@source ".*cloudflare-next-intl\/";/);
    });
});
