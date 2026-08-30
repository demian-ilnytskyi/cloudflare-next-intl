import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    collectUsedImageOverrides,
    collectUsedImages,
    extractImageOverrides,
    extractImageReferences,
    findCodeFiles,
} from "./scan_used.js";
import { cleanup, makeTempDir, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

describe("scan_used", () => {
    it("findCodeFiles scans code files and ignores specified directories", async () => {
        const root = await makeTempDir();
        await mkdir(path.join(root, "src", "components"), { recursive: true });
        await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
        await mkdir(path.join(root, ".next"), { recursive: true });

        const appFile = path.join(root, "src", "app.tsx");
        const compFile = path.join(root, "src", "components", "button.vue");
        const txtFile = path.join(root, "src", "notes.txt");
        const ignoredFile = path.join(root, "node_modules", "pkg", "index.js");

        await writeFile(appFile, "export const x = 1;");
        await writeFile(compFile, "<template></template>");
        await writeFile(txtFile, "hello");
        await writeFile(ignoredFile, "module.exports = {};");

        const found = await findCodeFiles(root);
        expect(found.sort()).toEqual([appFile, compFile].sort());

        // Handles non-existent directory
        const nonExistent = await findCodeFiles(path.join(root, "missing_dir"));
        expect(nonExistent).toEqual([]);

        await cleanup(root);
    });

    it("extractImageReferences extracts image paths with supported extensions and query parameters", () => {
        const code = `
            import Image from "next/image";
            import hero from "public/images/hero.png";
            export function Component() {
                return (
                    <div>
                        <Image src="/images/banner.jpg?v=123" alt="Banner" />
                        <Image src={'/icons/logo.webp'} alt="Logo" />
                        <img src="/images/photo.jpeg#hash" />
                        <a href="/docs/guide.pdf">Guide</a>
                    </div>
                );
            }
        `;

        const refs = extractImageReferences(code);
        expect(refs.sort()).toEqual([
            "/icons/logo.webp",
            "/images/banner.jpg",
            "/images/photo.jpeg",
            "public/images/hero.png",
        ].sort());
    });

    it("extractImageOverrides reads per-image formats/blur/quality/maxWidth props off <Image> tags", () => {
        const code = `
            <Image src="/images/hero.png" formats={["avif", "webp"]} quality={95} maxWidth={800} />
            <Image src="/images/off.png" formats={false} blur={false} />
            <Image src={"/images/full.png"} maxWidth={false} blur={{ size: 16, quality: 90, stdDeviation: 12 }} />
            <Image src="/images/simple-blur.png" blur={true} />
            <Image src="/images/no-props.png" alt="nothing special" />
            <Image alt="no src" formats={["webp"]} />
        `;

        const overrides = extractImageOverrides(code);

        expect(overrides["/images/hero.png"]).toEqual({ formats: ["avif", "webp"], quality: 95, maxWidth: 800 });
        expect(overrides["/images/off.png"]).toEqual({ formats: false, blur: false });
        expect(overrides["/images/full.png"]).toEqual({
            maxWidth: false,
            blur: { size: 16, quality: 90, stdDeviation: 12 },
        });
        expect(overrides["/images/simple-blur.png"]).toEqual({ blur: true });
        expect(overrides["/images/no-props.png"]).toBeUndefined();
        expect(Object.keys(overrides)).not.toContain(undefined);
    });

    it("extractImageOverrides ignores unrecognized format keywords, non-numeric maxWidth, and an empty src", () => {
        const code = `
            <Image src="/images/weird.png" formats={["bogus"]} maxWidth={"nope"} />
            <Image src="/images/empty-formats.png" formats={[]} />
        `;
        const overrides = extractImageOverrides(code);
        expect(overrides["/images/weird.png"]).toBeUndefined();
        expect(overrides["/images/empty-formats.png"]).toBeUndefined();
    });

    it("extractImageOverrides ignores an empty blur object and a tag without a src", () => {
        const code = `
            <Image alt="no src at all" quality={80} />
            <Image src="/images/blank-blur.png" blur={{}} />
        `;
        const overrides = extractImageOverrides(code);
        expect(overrides["/images/blank-blur.png"]).toBeUndefined();
        expect(Object.keys(overrides)).toEqual([]);
    });

    it("collectUsedImageOverrides scans project code files and resolves overrides by public src", async () => {
        const root = await makeTempDir();
        const srcDir = path.join(root, "src");
        await mkdir(srcDir, { recursive: true });

        await writeFile(
            path.join(srcDir, "Page.tsx"),
            `
            import Image from "next/image";
            export default function Page() {
                return (
                    <>
                        <Image src="/images/hero.png" formats={["avif"]} />
                        <Image src="public/images/hero.png" quality={70} />
                    </>
                );
            }
            `,
        );
        await writeFile(
            path.join(root, "root-page.tsx"),
            `<Image src="/images/top-level.png" formats={["gif"]} />`,
        );
        await mkdir(path.join(root, "public"), { recursive: true });
        await writeFile(
            path.join(root, "public", "should-be-skipped.tsx"),
            `<Image src="/images/skipped.png" formats={["heif"]} />`,
        );
        await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
        await writeFile(
            path.join(root, "node_modules", "pkg", "index.tsx"),
            `<Image src="/images/ignored-dir.png" formats={["jp2"]} />`,
        );

        const overrides = await collectUsedImageOverrides(root, "public");
        expect(overrides["/images/skipped.png"]).toBeUndefined();
        expect(overrides["/images/ignored-dir.png"]).toBeUndefined();
        expect(overrides["/images/hero.png"]).toEqual({ formats: ["avif"], quality: 70 });
        expect(overrides["/images/top-level.png"]).toEqual({ formats: ["gif"] });

        const nonExistent = await collectUsedImageOverrides(path.join(root, "does_not_exist"));
        expect(nonExistent).toEqual({});

        await cleanup(root);
    });

    it("collectUsedImages finds only referenced images existing on disk under public and skips directories", async () => {
        const root = await makeTempDir();
        const publicDir = path.join(root, "public");
        const srcDir = path.join(root, "src");

        await mkdir(path.join(publicDir, "images"), { recursive: true });
        await mkdir(path.join(publicDir, "icons"), { recursive: true });
        await mkdir(path.join(publicDir, "images", "folder.png"), { recursive: true });
        await mkdir(srcDir, { recursive: true });

        const usedImg = await writeFixturePng(path.join(publicDir, "images"), "used.png", 20, 20);
        const usedIcon = await writeFixturePng(path.join(publicDir, "icons"), "icon.png", 20, 20);
        const unusedImg = await writeFixturePng(path.join(publicDir, "images"), "unused.png", 20, 20);

        const codeFile = path.join(srcDir, "Page.tsx");
        await writeFile(
            codeFile,
            `
            import Image from "next/image";
            export default function Page() {
                return (
                    <>
                        <Image src="/images/used.png" alt="Used" />
                        <Image src="public/icons/icon.png" alt="Icon" />
                        <Image src="/images/missing-file.png" alt="Missing" />
                        <Image src="/images/folder.png" alt="Directory Not File" />
                        <Image src="../../outside.png" alt="Outside" />
                    </>
                );
            }
            `,
        );

        const found = await collectUsedImages(root, "public");
        expect(found.sort()).toEqual([usedIcon, usedImg].sort());
        expect(found).not.toContain(unusedImg);

        // Handles unreadable/missing root
        const nonExistent = await collectUsedImages(path.join(root, "does_not_exist"));
        expect(nonExistent).toEqual([]);

        await cleanup(root);
    });
});
