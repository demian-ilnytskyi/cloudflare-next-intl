import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { blankComments, collectUnusedImages, extractImageUsageDetails, imageOptimizerPlugin, resolveOptions, run, transformMetadataImageUrls } from "./index.js";
import { isAppleIconAt } from "./metadata_transform.js";
import { cleanup, makeTempDir, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

async function project(files: Record<string, string>, images: string[]): Promise<string> {
    const root = await makeTempDir();
    for (const [rel, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
        await writeFile(path.join(root, rel), content);
    }
    for (const rel of images) {
        await writeFixturePng(path.dirname(path.join(root, rel)), path.basename(rel), 20, 20);
    }
    return root;
}

const DIRS = ["public/images", "public/icons"];

describe("collectUnusedImages", () => {
    it("lists only images nothing references", async () => {
        const root = await project(
            {
                "src/page.tsx": '<Image src="/images/used.png" /> <img src="/icons/raw.png" />',
                "src/style.css": ".a { background: url(/images/bg.png); }",
                "public/site.webmanifest": '{"icons":[{"src":"/icons/app.png"}]}',
            },
            [
                "public/images/used.png",
                "public/images/bg.png",
                "public/icons/raw.png",
                "public/icons/app.png",
                "public/images/old.png",
                "public/images/nested/stale.png",
            ],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["images/nested/stale.png", "images/old.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it("keeps images whose name or stem is mentioned in any form", async () => {
        const root = await project(
            {
                "src/a.ts": 'export const icons = { arrow: "arrow_icon" };',
                "src/b.ts": 'const file = "hero.png";',
            },
            ["public/images/arrow_icon.png", "public/images/hero.png", "public/images/old.png"],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["images/old.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it("keeps every image under a directory a path is built from dynamically", async () => {
        const root = await project(
            {
                "src/flag.tsx": "const src = `/images/flags/${code}.png`; const a = \"/images/used.png\";",
            },
            ["public/images/flags/ua.png", "public/images/flags/pl.png", "public/images/used.png", "public/images/old.png"],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["images/old.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it("treats a dynamic parent directory as covering nested images", async () => {
        const root = await project(
            { "src/a.ts": 'const src = "/images/" + folder + "/" + name; const b = "/icons/used.png";' },
            ["public/images/team/a.png", "public/icons/used.png", "public/icons/old.png"],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["icons/old.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it("prunes nothing when no image is referenced at all", async () => {
        const root = await project({ "src/a.ts": "export {};" }, ["public/images/a.png", "public/images/b.png"]);
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual([]);
        } finally {
            await cleanup(root);
        }
    });

    it("never looks outside public, nor at public root files", async () => {
        const root = await project(
            { "src/a.ts": 'const a = "/images/used.png";' },
            ["public/favicon.png", "public/images/used.png", "public/images/old.png", "assets/x.png"],
        );
        try {
            expect(await collectUnusedImages(root, [...DIRS, "assets"])).toEqual(["images/old.png"]);
            expect(await collectUnusedImages(root, ["public/missing"])).toEqual([]);
        } finally {
            await cleanup(root);
        }
    });
});

describe("pruneUnusedFromBuild", () => {
    it("defaults to true and can be turned off", () => {
        expect(resolveOptions().pruneUnusedFromBuild).toBe(true);
        expect(resolveOptions({ pruneUnusedFromBuild: false }).pruneUnusedFromBuild).toBe(false);
    });

    it("does not optimize unused images even when onlyUsed is false", async () => {
        const root = await project(
            { "src/page.tsx": '<Image src="/images/used.png" />' },
            ["public/images/used.png", "public/images/old.png"],
        );
        try {
            const entries = await run(root, resolveOptions({ onlyUsed: false, blur: false }));
            expect(entries.map((e) => e.originalSrc)).toEqual(["/images/used.png"]);
            const keep = await run(root, resolveOptions({ onlyUsed: false, blur: false, pruneUnusedFromBuild: false }));
            expect(keep.map((e) => e.originalSrc).sort()).toEqual(["/images/old.png", "/images/used.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it("removes unused images from the build output and keeps used ones", async () => {
        const root = await project(
            {
                "src/page.tsx": '<Image src="/images/used.png" /> <img src="/images/raw.png" />',
                "dist/client/images/used.png": "x",
                "dist/client/images/raw.png": "x",
                "dist/client/images/old.png": "x",
                "dist/client/favicon.png": "x",
            },
            ["public/images/used.png", "public/images/raw.png", "public/images/old.png"],
        );
        const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
        try {
            for (const [options, expectOld] of [[{ pruneUnusedFromBuild: false }, true], [{}, false]] as const) {
                await writeFile(path.join(root, "dist/client/images/old.png"), "x");
                const plugin = imageOptimizerPlugin({ blur: false, pruneOriginalsFromBuild: false, ...options });
                (plugin.configResolved as (c: { command: string }) => void)({ command: "build" });
                const ctx = { info: vi.fn() };
                await (plugin.buildStart as (this: typeof ctx) => Promise<void>).call(ctx);
                (plugin.closeBundle as (this: typeof ctx) => void).call(ctx);
                expect(existsSync(path.join(root, "dist/client/images/old.png"))).toBe(expectOld);
                expect(existsSync(path.join(root, "dist/client/images/used.png"))).toBe(true);
                expect(existsSync(path.join(root, "dist/client/images/raw.png"))).toBe(true);
                expect(existsSync(path.join(root, "dist/client/favicon.png"))).toBe(true);
            }
        } finally {
            cwdSpy.mockRestore();
            await cleanup(root);
        }
    });
});

describe("apple touch icons in metadata", () => {
    const manifest = { "/images/logo.png": { src: "/generated/images/logo.webp" } };

    it.each([
        ['export const metadata = { icons: { icon: "/images/logo.png", apple: "/images/logo.png" } };', 'apple: "/images/logo.png"'],
        ['export const metadata = { icons: { apple: ["/images/a.png", "/images/logo.png"] } };', '"/images/logo.png"] }'],
        ['export const metadata = { icons: { apple: [{ url: "/images/logo.png", sizes: "180x180" }] } };', 'url: "/images/logo.png"'],
        ['export const metadata = { icons: { other: [{ rel: "apple-touch-icon", url: "/images/logo.png" }] } };', 'url: "/images/logo.png"'],
    ])("keeps the original file for %s", (code, kept) => {
        const out = transformMetadataImageUrls(code, manifest) ?? code;
        expect(out).toContain(kept);
    });

    it("rewrites other icons and their declared type", () => {
        const code = 'export const metadata = { icons: { icon: [{ url: "/images/logo.png", type: "image/png" }], shortcut: "/images/logo.png" } };';
        const out = transformMetadataImageUrls(code, manifest)!;
        expect(out).toContain('{ url: "/generated/images/logo.webp", type: "image/webp" }');
        expect(out).toContain('shortcut: "/generated/images/logo.webp"');
    });

    it("leaves a type alone when its object holds no rewritten url, or the format has no known mime", () => {
        const code = 'export const metadata = { icons: { icon: [{ url: "/images/x.png", type: "image/png" }, { url: "/images/logo.png" }] } };';
        expect(transformMetadataImageUrls(code, manifest)).toContain('{ url: "/images/x.png", type: "image/png" }');
        const odd = 'export const metadata = { icons: { icon: [{ url: "/images/logo.png", type: "image/png" }] } };';
        expect(transformMetadataImageUrls(odd, { "/images/logo.png": { src: "/generated/images/logo.jxl" } })).toContain('type: "image/png"');
    });

    it("treats an apple icon as a non-optimized use, so its original is not pruned", () => {
        const code = 'export const metadata = { icons: { icon: "/images/icon.png", apple: "/images/logo.png" } };';
        const details = extractImageUsageDetails(code, "layout.tsx");
        expect([...details.metadataRefs]).toEqual(["/images/icon.png"]);
        expect([...details.otherRefs]).toEqual(["/images/logo.png"]);
    });

    it("detects apple icons at the edges of a block", () => {
        expect(isAppleIconAt('"/a.png"', 0)).toBe(false);
        expect(isAppleIconAt('{ rel: "apple-touch-icon", url: "/a.png"', 33)).toBe(true);
    });
});

describe("origin-prefixed image urls", () => {
    it.each([
        "`${KTextConstants.baseUrl}/images/profile.png`",
        '"https://example.com/images/profile.png"',
        '"//example.com/images/profile.png"',
    ])("count %s as a raw use of /images/profile.png, so the original is kept", async (ref) => {
        const root = await project(
            {
                "src/page.tsx": '<Image src="/images/profile.png" />',
                "src/seo.ts": `export const url = ${ref};`,
            },
            ["public/images/profile.png"],
        );
        try {
            const { classifyImageUsages, getPrunableOriginalPaths } = await import("./index.js");
            const usage = await classifyImageUsages(root);
            expect(usage["/images/profile.png"]).toMatchObject({ inImageComponent: true, inOtherPlace: true });
            expect(getPrunableOriginalPaths(usage, { "/images/profile.png": { src: "/generated/images/profile.webp" } }, true)).toEqual([]);
        } finally {
            await cleanup(root);
        }
    });
});

describe("references only in comments or docs", () => {
    it("do not keep an image, references in code and config files do", async () => {
        const root = await project(
            {
                "src/a.ts": [
                    'export const chart = "/images/chart.png";',
                    "// old: /images/line.png",
                    "/* also /images/block.png */",
                    'const url = "https://example.com/x"; // see /images/after.png',
                ].join("\n"),
                "src/b.tsx": "export const B = () => <div>{/* <img src=\"/images/jsx.png\" /> */}<img src=\"/images/raw.png\" /></div>;",
                "src/c.css": "/* .x { background: url(/images/css_comment.png) } */ .y { background: url(/images/bg.png); }",
                "src/d.html": '<!-- <img src="/images/html_comment.png"> --><img src="/images/html.png">',
                "next.config.ts": 'const brand = "/images/next_brand.png"; void brand; export default {};',
                "vite.config.ts": 'const splash = "/images/vite_splash.png"; void splash; export default {};',
                "README.md": "![logo](/images/readme.png)",
                "src/docs.md": "![x](/images/src_doc.png)",
                "public/content.md": "![x](/images/public_doc.png)",
                "data-base/seeds/boosts.sql": "INSERT INTO boosts (icon_path) VALUES ('/images/sql_seed.png');",
                "backend/vision.py": 'ICON = "/images/py_icon.png"',
            },
            [
                "public/images/chart.png", "public/images/line.png", "public/images/block.png", "public/images/after.png",
                "public/images/jsx.png", "public/images/raw.png", "public/images/css_comment.png", "public/images/bg.png",
                "public/images/html_comment.png", "public/images/html.png", "public/images/next_brand.png",
                "public/images/vite_splash.png", "public/images/readme.png", "public/images/src_doc.png", "public/images/public_doc.png",
                "public/images/sql_seed.png", "public/images/py_icon.png",
            ],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual([
                "images/after.png", "images/block.png", "images/css_comment.png", "images/html_comment.png",
                "images/jsx.png", "images/line.png", "images/readme.png", "images/src_doc.png",
            ]);
        } finally {
            await cleanup(root);
        }
    });

    it("do not count as a raw use when classifying an <Image> original", () => {
        const code = '// <img src="/images/hero.png" />\nexport const A = () => <Image src="/images/hero.png" alt="" />;';
        const details = extractImageUsageDetails(code, "page.tsx");
        expect([...details.imageComponentRefs]).toEqual(["/images/hero.png"]);
        expect(details.otherRefs.size).toBe(0);
    });

    it("blankComments keeps strings, urls and offsets", () => {
        const code = 'const a = "// not a comment"; const b = \'/* nor */\'; const c = `x\n// y`; // gone\nhttp://host/z';
        const out = blankComments(code, "a.ts");
        expect(out).toHaveLength(code.length);
        expect(out).toContain('"// not a comment"');
        expect(out).toContain("'/* nor */'");
        expect(out).toContain("`x\n// y`");
        expect(out).not.toContain("gone");
        expect(out).toContain("http://host/z");
        expect(blankComments("/* unterminated", "a.css")).toBe("               ");
        expect(blankComments("<!-- open", "a.html")).toBe("         ");
        expect(blankComments('{"a": "/images/x.png"}', "a.json")).toBe('{"a": "/images/x.png"}');
        expect(blankComments("const s = 'a\\'b'; // c", "a.ts")).toBe("const s = 'a\\'b';     ");
    });
});

describe("dynamic directory detection", () => {
    it("ignores a bare word equal to the folder name, e.g. a SQL column", async () => {
        const root = await project(
            {
                "supabase/schema.sql": 'CREATE TABLE p ("images" "jsonb"); SELECT \'images\';',
                "src/a.ts": 'const a = "/images/used.png";',
            },
            ["public/images/used.png", "public/images/old.png"],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["images/old.png"]);
        } finally {
            await cleanup(root);
        }
    });

    it.each([
        'const a = "images/" + name;',
        "const a = `/images/${name}`;",
        'const a = path.join("/images", name);',
        "const a = `public/images/${name}.png`;",
    ])("treats %s as building paths in the folder", async (code) => {
        const root = await project(
            { "src/a.ts": `${code}\nconst b = "/icons/used.png";` },
            ["public/images/x.png", "public/icons/used.png", "public/icons/old.png"],
        );
        try {
            expect(await collectUnusedImages(root, DIRS)).toEqual(["icons/old.png"]);
        } finally {
            await cleanup(root);
        }
    });
});

describe("original is removed only when <Image> is its only use", () => {
    const manifestFor = (names: string[]) =>
        Object.fromEntries(names.map((n) => [`/images/${n}.png`, { src: `/generated/images/${n}.webp` }]));

    it("prunes <Image>-only images and keeps any image also used elsewhere in code", async () => {
        const names = [
            "literal", "const_only", "import_only", "const_and_img", "import_and_img", "exported",
            "other_file", "config", "sql", "commented", "alt_too", "require",
        ];
        const root = await project(
            {
                "src/a.tsx": [
                    'import importOnly from "@/../public/images/import_only.png";',
                    'import importAndImg from "@/../public/images/import_and_img.png";',
                    'const constOnly = "/images/const_only.png";',
                    'const constAndImg = "/images/const_and_img.png";',
                    'export const exported = "/images/exported.png";',
                    'const altToo = "/images/alt_too.png";',
                    'const req = require("../public/images/require.png");',
                    "// const old = <img src=\"/images/commented.png\" />;",
                    "export const A = () => (<div>",
                    '  <Image src="/images/literal.png" alt="" />',
                    '  <Image src="/images/other_file.png" alt="" />',
                    '  <Image src="/images/config.png" alt="" />',
                    '  <Image src="/images/sql.png" alt="" />',
                    '  <Image src="/images/commented.png" alt="" />',
                    "  <Image src={constOnly} alt=\"\" />",
                    "  <Image src={importOnly} alt=\"\" />",
                    "  <Image src={constAndImg} alt=\"\" /><img src={constAndImg} />",
                    "  <Image src={importAndImg} alt=\"\" /><img src={importAndImg.src} />",
                    "  <Image src={exported} alt=\"\" />",
                    "  <Image src={altToo} alt={altToo} />",
                    "  <img src={req} />",
                    "</div>);",
                ].join("\n"),
                "src/b.ts": 'export const shareUrl = "/images/other_file.png";',
                "vite.config.ts": 'const splash = "/images/config.png"; void splash; export default {};',
                "supabase/seed.sql": "INSERT INTO t (icon) VALUES ('/images/sql.png');",
            },
            names.map((n) => `public/images/${n}.png`),
        );
        try {
            const { classifyImageUsages, getPrunableOriginalPaths } = await import("./index.js");
            const prunable = getPrunableOriginalPaths(await classifyImageUsages(root), manifestFor(names), true);
            expect(prunable).toEqual([
                "images/commented.png",
                "images/const_only.png",
                "images/import_only.png",
                "images/literal.png",
            ]);
        } finally {
            await cleanup(root);
        }
    });
});
