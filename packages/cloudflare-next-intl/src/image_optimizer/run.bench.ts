import { bench, describe } from "vitest";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { makeTempDir, writeFixtureJpg } from "../test_utils/image_optimizer_test_helpers.js";
import { run } from "./run.js";
import { resolveOptions } from "./types.js";

const root = await makeTempDir();
const imagesDir = path.join(root, "public", "images");
await mkdir(imagesDir, { recursive: true });

for (let i = 0; i < 12; i++) {
    await writeFixtureJpg(imagesDir, `photo-${i}.jpg`, 1600, 1200);
}

const options = resolveOptions({
    dirs: ["public/images"],
    onlyUsed: false,
    formats: ["webp"],
    outDir: "public/generated",
    manifest: "public/generated/images.json",
});

describe("run(): 12 photos end to end", () => {
    bench("single format + blur", async () => {
        const cacheFile = path.join(root, ".cache", `${Math.random()}.json`);
        await run(root, options, cacheFile);
    }, { iterations: 3 });
});
