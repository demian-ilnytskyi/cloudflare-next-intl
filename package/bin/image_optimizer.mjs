#!/usr/bin/env node
import path from "node:path";
import { run } from "../dist/src/image_optimizer/run.js";
import { resolveOptions } from "../dist/src/image_optimizer/types.js";

const root = process.cwd();
const options = resolveOptions();
const cacheFile = path.resolve(root, options.cacheDir, "manifest.json");

console.log("[cfni-image-optimizer] scanning images in", options.dirs.join(", "));
const entries = await run(root, options, cacheFile);
console.log(`[cfni-image-optimizer] processed ${entries.length} images into ${options.outDir}`);
