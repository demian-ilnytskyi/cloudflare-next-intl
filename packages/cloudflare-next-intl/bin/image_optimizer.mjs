#!/usr/bin/env node
import path from "node:path";
import { run } from "../dist/src/image_optimizer/run.js";
import { resolveOptions } from "../dist/src/image_optimizer/types.js";

const root = process.cwd();
const args = process.argv.slice(2);
const onlyUsed = !args.includes("--all");
const options = resolveOptions({ onlyUsed });
const cacheFile = path.resolve(root, options.cacheDir, "manifest.json");

if (onlyUsed) {
    console.log("[cfni-image-optimizer] scanning code for used <Image> references...");
} else {
    console.log("[cfni-image-optimizer] scanning all images in", options.dirs.join(", "));
}

const entries = await run(root, options, cacheFile);
console.log(`[cfni-image-optimizer] processed ${entries.length} images into ${options.outDir}`);
