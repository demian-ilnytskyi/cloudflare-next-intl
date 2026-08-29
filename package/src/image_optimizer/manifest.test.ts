import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderManifest, writeManifest } from "./manifest.js";
import { cleanup, makeTempDir } from "../test_utils/image_optimizer_test_helpers.js";

describe("manifest", () => {
    it("renderManifest outputs valid sorted JSON containing images key", () => {
        const entries = [
            { originalSrc: "/images/z.png", src: "/generated/images/z.png", width: 10, height: 10 },
            { originalSrc: "/images/a.png", src: "/generated/images/a.png", width: 20, height: 20 },
        ];
        const json = renderManifest(entries);
        const parsed = JSON.parse(json);
        expect(parsed.images).toBeDefined();
        expect(Object.keys(parsed.images)).toEqual(["/images/a.png", "/images/z.png"]);
    });

    it("writeManifest writes file idempotently", async () => {
        const root = await makeTempDir();
        const manifestPath = path.join(root, "out", "images.json");
        const entries = [
            { originalSrc: "/images/a.png", src: "/generated/images/a.png", width: 20, height: 20 },
        ];

        await writeManifest(manifestPath, entries);
        const first = await readFile(manifestPath, "utf8");

        await writeManifest(manifestPath, entries);
        const second = await readFile(manifestPath, "utf8");

        expect(first).toBe(second);
        await cleanup(root);
    });
});
