import { describe, it, expect } from "vitest";
import { utimes } from "node:fs/promises";
import path from "node:path";
import { isFresh, loadCache, saveCache } from "./cache.js";
import { cleanup, makeTempDir, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";

describe("cache", () => {
    it("loadCache returns empty object when file missing or malformed", async () => {
        const root = await makeTempDir();
        const cache = await loadCache(path.join(root, "missing.json"));
        expect(cache).toEqual({});

        const badFile = path.join(root, "bad.json");
        await (await import("node:fs/promises")).writeFile(badFile, "not-json", "utf8");
        expect(await loadCache(badFile)).toEqual({});

        await cleanup(root);
    });

    it("saveCache then loadCache round-trips", async () => {
        const root = await makeTempDir();
        const cacheFile = path.join(root, "sub", "cache.json");
        const data = {
            "public/images/a.png": {
                mtimeMs: 12345,
                size: 678,
                result: {
                    originalSrc: "/images/a.png",
                    src: "/generated/images/a.png",
                    width: 100,
                    height: 100,
                },
            },
        };

        await saveCache(cacheFile, data);
        const loaded = await loadCache(cacheFile);
        expect(loaded).toEqual(data);
        await cleanup(root);
    });

    it("isFresh handles freshness, missing siblings, and stat errors", async () => {
        const root = await makeTempDir();
        const source = await writeFixturePng(root, "source.png", 10, 10);
        const target = await writeFixturePng(root, "target.png", 10, 10);
        const sibling = await writeFixturePng(root, "sibling.webp", 10, 10);

        const entry = {
            mtimeMs: 1000,
            size: 100,
            result: {
                originalSrc: "/images/source.png",
                src: "/generated/images/source.png",
                width: 10,
                height: 10,
            },
        };

        await utimes(source, new Date(1000), new Date(1000));
        entry.size = (await (await import("node:fs/promises")).stat(source)).size;

        expect(await isFresh(source, entry, [target, sibling])).toBe(true);
        expect(await isFresh(source, entry, [target, path.join(root, "missing.webp")])).toBe(false);
        expect(await isFresh(source, undefined, [target])).toBe(false);
        expect(await isFresh(path.join(root, "missing-source.png"), entry, [target])).toBe(false);

        await cleanup(root);
    });
});
