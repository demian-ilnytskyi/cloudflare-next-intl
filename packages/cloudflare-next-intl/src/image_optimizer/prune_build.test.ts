import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pruneBuildOutput } from "./prune_build.js";

describe("pruneBuildOutput", () => {
    it("deletes specified prunable files from outDir and cleans up empty dirs", () => {
        const tmpDir = path.join(os.tmpdir(), `test-prune-${Date.now()}`);
        const clientDir = path.join(tmpDir, "dist", "client");
        const imagesDir = path.join(clientDir, "images");
        const subDir = path.join(imagesDir, "sub");

        mkdirSync(subDir, { recursive: true });

        const prunable1 = path.join(imagesDir, "hero.png");
        const prunable2 = path.join(subDir, "card.png");
        const keepFile = path.join(imagesDir, "keep.png");

        writeFileSync(prunable1, "hero content");
        writeFileSync(prunable2, "card content");
        writeFileSync(keepFile, "keep content");

        const result = pruneBuildOutput(
            [clientDir],
            ["images/hero.png", "images/sub/card.png"],
        );

        expect(result.prunedFiles.length).toBe(2);
        expect(result.bytesSaved).toBeGreaterThan(0);
        expect(existsSync(prunable1)).toBe(false);
        expect(existsSync(prunable2)).toBe(false);
        expect(existsSync(keepFile)).toBe(true);

        // Subdir was emptied, so it should be cleaned up
        expect(existsSync(subDir)).toBe(false);
        // Images dir still has keepFile, so it should remain
        expect(existsSync(imagesDir)).toBe(true);
    });

    it("safely handles non-existent outDirs or files", () => {
        const nonExistent = path.join(os.tmpdir(), `no-dir-${Date.now()}`);
        const result = pruneBuildOutput([nonExistent], ["images/none.png"]);
        expect(result.prunedFiles).toEqual([]);
        expect(result.bytesSaved).toBe(0);
    });

    it("skips paths resolving outside outDir or when target is a directory", () => {
        const tmpDir = path.join(os.tmpdir(), `test-prune-guard-${Date.now()}`);
        const clientDir = path.join(tmpDir, "dist", "client");
        const subDir = path.join(clientDir, "subfolder");
        mkdirSync(subDir, { recursive: true });

        const outsideResult = pruneBuildOutput([clientDir], ["../../outside.png"]);
        expect(outsideResult.prunedFiles).toEqual([]);

        const dirResult = pruneBuildOutput([clientDir], ["subfolder"]);
        expect(dirResult.prunedFiles).toEqual([]);
        expect(existsSync(subDir)).toBe(true);
    });
});

