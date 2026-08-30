# Image Optimizer Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `package/src/image_optimizer` measurably faster (source decoded once, encodes run in parallel, files processed concurrently, encoder settings chosen from benchmark data) without changing generated output unless deliberately re-baselined.

**Architecture:** Three layers of change. (1) A byte-identity test locks current output so the pure-speed refactor is provably safe. (2) `process_image.ts` decodes the source once into a buffer and fans encodes out with `Promise.all`; `run.ts` processes files with a bounded concurrency pool and stops reading `metadata()` twice per file. (3) Benchmarks decide new encoder defaults (`effort`, `kernel`, `mozjpeg`), which are exposed as opt-in config on `ImageOptimizerPluginOptions`.

**Tech Stack:** TypeScript (ESM, NodeNext), sharp, vitest (`vitest run --coverage`) + vitest bench (`vitest bench --run` via `vitest.bench.config.ts`), Node `node:fs/promises`.

**Spec:** No separate spec file — the approved design is reproduced in "Approved Design" below.

## Approved Design

Phases, each independently verifiable:

1. Baseline: run bench on `process_image.bench.ts`, save JSON. Add bench cases for multi-format, multi-width, and `run()` over many files.
2. Byte-identity harness: hash every output file, snapshot the hashes.
3. Pure-speed refactor, hashes must stay identical: decode source once and reuse the buffer; `Promise.all` sibling formats and extra widths; write the blur buffer with `writeFile` instead of a second sharp pass; drop the duplicate `metadata()` read; bounded-concurrency file loop in `run()`; tune `sharp.concurrency`/`sharp.cache`.
4. Encoder tuning: bench-driven; adopt a new default only on a clear win at acceptable size delta; re-baseline hashes deliberately, recording before/after file sizes.
5. Config knobs: `concurrency` and per-format `effort` in options, defaults = what phase 4 picks.
6. Verify: full test run, bench again, report before/after.

## Global Constraints

- Package under test is `package/`. Run every command from `/Volumes/External/own_projects/cloudflare-next-intl/package`.
- Tests: `npm test` (= `vitest run --coverage`). Benches: `npm run bench` (= `vitest bench --run`, uses `vitest.bench.config.ts`).
- Coverage thresholds are **perFile 100%** for `src/**/!(general_functions|middleware).{ts,tsx}`. Every new branch in `process_image.ts`, `run.ts`, `types.ts` MUST be covered by tests or `npm test` fails.
- `*.bench.ts` files are excluded from coverage; `src/test_utils/**` is excluded too.
- Indentation in `src/image_optimizer/**` is 4 spaces. No new comments except where the file already uses doc comments to explain non-obvious behavior.
- ESM: all relative imports end in `.js`.
- Public API additions must stay backward compatible: every new option is optional with a default that preserves current behavior unless a task explicitly says the default changes.
- Scratchpad for bench JSON: `/private/tmp/claude-501/-Volumes-External-own-projects-cloudflare-next-intl/78d0bb8d-a333-494d-b309-e7e92fd77fb4/scratchpad`. Referred to below as `$SCRATCH`.
- Do not add new runtime dependencies. Concurrency limiting is hand-rolled (see Task 5).

## File Structure

- `package/vitest.bench.config.ts` — MODIFY. `benchmark.include` currently lists only `src/server/components/helper_script.bench.ts`, so the image bench never runs. Add the image bench and make `outputJson` a stable path.
- `package/src/image_optimizer/process_image.bench.ts` — MODIFY. Add multi-format, multi-width, and encoder-knob cases.
- `package/src/image_optimizer/run.bench.ts` — CREATE. Whole-directory `run()` benchmark; this is where concurrency wins show up.
- `package/src/test_utils/image_optimizer_test_helpers.ts` — MODIFY. Add `hashDir()` used by the identity test.
- `package/src/image_optimizer/output_identity.test.ts` — CREATE. Locks output bytes across the refactor.
- `package/src/image_optimizer/process_image.ts` — MODIFY. Single decode, parallel encodes, cheaper blur, accepts precomputed metadata.
- `package/src/image_optimizer/run.ts` — MODIFY. Bounded-concurrency file pool, single metadata read per file, sharp runtime tuning.
- `package/src/image_optimizer/types.ts` — MODIFY. `concurrency` and `effort` options.
- `package/src/image_optimizer/types.test.ts`, `run.test.ts`, `process_image.test.ts` — MODIFY. Cover new branches.
- `package/README.md`, `package/CHANGELOG.md` — MODIFY in the final task.

---

### Task 1: Wire the image benches into the bench config and capture a baseline

**Files:**
- Modify: `package/vitest.bench.config.ts`
- Create: `package/src/image_optimizer/run.bench.ts`
- Modify: `package/src/image_optimizer/process_image.bench.ts`

**Interfaces:**
- Consumes: `processImage`, `resolveOptions`, `run` from the image_optimizer module; `makeTempDir`, `writeFixturePng`, `writeFixtureJpg` from `../test_utils/image_optimizer_test_helpers.js`.
- Produces: baseline bench JSON at `$SCRATCH/bench-baseline.json`. Later tasks compare against it.

- [ ] **Step 1: Include the image benches and stabilize the output path**

In `package/vitest.bench.config.ts` replace the `benchmark` block with:

```ts
        benchmark: {
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
            ],
            outputJson: process.env.BENCH_JSON ?? './bench-result.json',
        },
```

- [ ] **Step 2: Add a whole-run benchmark**

Create `package/src/image_optimizer/run.bench.ts`:

```ts
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
```

- [ ] **Step 3: Add multi-format and multi-width cases to the existing bench**

Append to `package/src/image_optimizer/process_image.bench.ts`:

```ts
describe("processImage: format fan-out", () => {
    bench("1 format (webp)", async () => {
        await processImage(photoJpg, root, resolveOptions({ formats: ["webp"] }), root);
    });
    bench("3 formats (avif, webp, png)", async () => {
        await processImage(photoJpg, root, resolveOptions({ formats: ["avif", "webp", "png"] }), root);
    });
});

describe("processImage: width fan-out", () => {
    bench("default width only", async () => {
        await processImage(largePng, root, resolveOptions({ formats: ["webp"] }), root);
    });
    bench("default + 3 extra widths", async () => {
        await processImage(largePng, root, resolveOptions({
            formats: ["webp"],
            overrides: { "/large.png": { extraWidths: [400, 800, 1200] } },
        }), root);
    });
});
```

- [ ] **Step 4: Run the benches and store the baseline**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
BENCH_JSON="$SCRATCH/bench-baseline.json" npm run bench
```

Expected: all image bench suites report timings; `$SCRATCH/bench-baseline.json` exists and is non-empty. Record the mean for `run(): 12 photos end to end` and for the format/width fan-out cases in the commit message.

- [ ] **Step 5: Commit**

```bash
git add vitest.bench.config.ts src/image_optimizer/process_image.bench.ts src/image_optimizer/run.bench.ts
git commit -m "test: bench image optimizer fan-out and whole-run path"
```

---

### Task 2: Byte-identity harness

**Files:**
- Modify: `package/src/test_utils/image_optimizer_test_helpers.ts`
- Create: `package/src/image_optimizer/output_identity.test.ts`

**Interfaces:**
- Produces: `hashDir(dir: string): Promise<Record<string, string>>` — maps each file path relative to `dir` (POSIX separators, sorted) to its sha256 hex digest. Tasks 3-5 use this to prove output is unchanged.

- [ ] **Step 1: Write the failing test**

Create `package/src/image_optimizer/output_identity.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { cleanup, hashDir, makeTempDir, writeFixtureJpg, writeFixturePng } from "../test_utils/image_optimizer_test_helpers.js";
import { run } from "./run.js";
import { resolveOptions } from "./types.js";

const roots: string[] = [];

afterAll(async () => {
    for (const dir of roots) await cleanup(dir);
});

async function buildFixtureRoot(): Promise<string> {
    const root = await makeTempDir();
    roots.push(root);
    const imagesDir = path.join(root, "public", "images");
    await mkdir(imagesDir, { recursive: true });
    await writeFixturePng(imagesDir, "flat.png", 640, 480);
    await writeFixtureJpg(imagesDir, "photo.jpg", 1200, 900);
    await writeFixturePng(imagesDir, "tall.png", 300, 900);
    return root;
}

function fixtureOptions() {
    return resolveOptions({
        dirs: ["public/images"],
        onlyUsed: false,
        formats: ["avif", "webp"],
        outDir: "public/generated",
        manifest: "public/generated/images.json",
        overrides: { "/images/photo.jpg": { extraWidths: [400, 800] } },
    });
}

describe("generated output is byte-stable", () => {
    it("produces identical bytes for identical inputs across runs", async () => {
        const first = await buildFixtureRoot();
        const second = await buildFixtureRoot();

        await run(first, fixtureOptions(), path.join(first, ".cache", "manifest.json"));
        await run(second, fixtureOptions(), path.join(second, ".cache", "manifest.json"));

        const a = await hashDir(path.join(first, "public", "generated"));
        const b = await hashDir(path.join(second, "public", "generated"));

        expect(Object.keys(a).length).toBeGreaterThan(0);
        expect(b).toEqual(a);
    });

    it("matches the recorded output snapshot", async () => {
        const root = await buildFixtureRoot();
        await run(root, fixtureOptions(), path.join(root, ".cache", "manifest.json"));
        const hashes = await hashDir(path.join(root, "public", "generated"));
        expect(hashes).toMatchSnapshot();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npx vitest run src/image_optimizer/output_identity.test.ts
```

Expected: FAIL — `hashDir` is not exported from `image_optimizer_test_helpers.js`.

- [ ] **Step 3: Implement `hashDir`**

Append to `package/src/test_utils/image_optimizer_test_helpers.ts` (and add `readFile, readdir` to the existing `node:fs/promises` import, plus `import { createHash } from "node:crypto";`):

```ts
export async function hashDir(dir: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    async function walk(current: string): Promise<void> {
        const items = await readdir(current, { withFileTypes: true });
        for (const item of items) {
            const full = path.join(current, item.name);
            if (item.isDirectory()) {
                await walk(full);
                continue;
            }
            const key = path.relative(dir, full).split(path.sep).join("/");
            result[key] = createHash("sha256").update(await readFile(full)).digest("hex");
        }
    }

    await walk(dir);
    return Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
}
```

- [ ] **Step 4: Run to verify it passes and writes a snapshot**

```bash
npx vitest run src/image_optimizer/output_identity.test.ts
```

Expected: PASS, 2 tests. A snapshot file `src/image_optimizer/__snapshots__/output_identity.test.ts.snap` is written. Open it and confirm it lists `.avif`, `.webp`, `.blur.webp`, `-400w.*`, `-800w.*` and `images.json` entries.

If the first test fails (hashes differ between two identical runs), STOP: output is not deterministic on this machine, and the rest of the plan's identity guarantee cannot hold. Report this instead of continuing.

- [ ] **Step 5: Commit**

```bash
git add src/test_utils/image_optimizer_test_helpers.ts src/image_optimizer/output_identity.test.ts src/image_optimizer/__snapshots__/output_identity.test.ts.snap
git commit -m "test: lock image optimizer output bytes with hash snapshot"
```

---

### Task 3: Decode the source once and reuse it across encodes

**Files:**
- Modify: `package/src/image_optimizer/process_image.ts`
- Test: `package/src/image_optimizer/output_identity.test.ts` (existing, must still pass unchanged)

**Interfaces:**
- Consumes: `hashDir` snapshot from Task 2.
- Produces: `encodeFormat(targetFile: string, source: Buffer, sourcePath: string, format: ImageFormat | "original", quality: number, targetWidth: number | undefined): Promise<void>` — same as before but takes the already-read source bytes; `sourcePath` is kept only to pick the extension for `"original"`.

- [ ] **Step 1: Read the source file once in `processImage`**

In `process_image.ts`, add `readFile` to the `node:fs/promises` import:

```ts
import { mkdir, readFile } from "node:fs/promises";
```

(Task 4 adds `writeFile` to this same import.)

In `processImage`, replace the metadata read with a single file read plus metadata from that buffer:

```ts
    const sourceBuffer = await readFile(absolutePath);
    const metadata = await sharp(sourceBuffer).metadata();
```

- [ ] **Step 2: Thread the buffer through `processVariant` and `encodeFormat`**

Change `encodeFormat`'s signature and first line:

```ts
async function encodeFormat(
    targetFile: string,
    source: Buffer,
    sourcePath: string,
    format: ImageFormat | "original",
    quality: number,
    targetWidth: number | undefined,
): Promise<void> {
    let pipeline = sharp(source);
```

Leave the rest of `encodeFormat`'s body unchanged — the `path.extname(sourcePath)` branch for `"original"` still uses `sourcePath`.

Add a `sourceBuffer: Buffer` parameter to `processVariant` immediately after `absolutePath`, pass it from `processImage` at both call sites, and change the two `encodeFormat(...)` calls inside `processVariant` to pass `sourceBuffer, absolutePath` where they used to pass just `absolutePath`.

- [ ] **Step 3: Run the identity test to verify bytes are unchanged**

```bash
npx vitest run src/image_optimizer/output_identity.test.ts src/image_optimizer/process_image.test.ts
```

Expected: PASS with no snapshot update. If the snapshot fails, the refactor changed output — revert and investigate; do NOT run `-u`.

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: PASS including 100% per-file coverage for `src/image_optimizer/process_image.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/image_optimizer/process_image.ts
git commit -m "perf: decode source image once per processImage call"
```

---

### Task 4: Parallel encodes and a cheaper blur write

**Files:**
- Modify: `package/src/image_optimizer/process_image.ts`
- Test: `package/src/image_optimizer/output_identity.test.ts`, `package/src/image_optimizer/process_image.test.ts` (existing)

**Interfaces:**
- Consumes: `encodeFormat(targetFile, source, sourcePath, format, quality, targetWidth)` from Task 3.
- Produces: `makeBlurDataURL(primaryBuffer: Buffer, targetFile: string, sourceWidth: number, sourceHeight: number, blurOptions: ResolvedBlurOptions)` — now takes the already-encoded primary bytes instead of re-reading `targetFile` from disk. `processVariant` returns the same `OptimizedImageVariant` shape as before.

- [ ] **Step 1: Make `encodeFormat` return the encoded bytes**

Replace `encodeFormat`'s final line:

```ts
    const buffer = await encoded.toBuffer();
    await writeFile(targetFile, buffer);
    return buffer;
}
```

and change its return type to `Promise<Buffer>`.

- [ ] **Step 2: Fan the sibling-format encodes out in parallel**

In `processVariant`, replace the primary encode plus the sequential `for` loop over `config.formats` with:

```ts
    const siblingFormats = config.formats.slice(1);
    const siblingTargets = siblingFormats.map((format) => {
        const ext = EXTENSION_BY_FORMAT[format];
        return {
            format,
            file: withWidthSuffix(targetFile.replace(/\.[^.]+$/, `.${ext}`), width, isDefault),
            src: withWidthSuffix(targetSrc.replace(/\.[^.]+$/, `.${ext}`), width, isDefault),
        };
    });

    const [primaryBuffer] = await Promise.all([
        encodeFormat(primaryFile, sourceBuffer, absolutePath, primaryFormat, config.quality, targetWidth),
        ...siblingTargets.map((target) =>
            encodeFormat(target.file, sourceBuffer, absolutePath, target.format, config.quality, targetWidth),
        ),
    ]);

    const sources: OptimizedImageSource[] = [
        { format: primaryFormat, src: primarySrc, type: mimeTypeFor(primaryFormat, publicSrc) },
        ...siblingTargets.map((target) => ({
            format: target.format,
            src: target.src,
            type: mimeTypeFor(target.format, publicSrc),
        })),
    ];
```

- [ ] **Step 3: Blur from the in-memory primary buffer, single sharp pass**

Replace `makeBlurDataURL`'s signature and body's I/O:

```ts
export async function makeBlurDataURL(
    primaryBuffer: Buffer,
    targetFile: string,
    sourceWidth: number,
    sourceHeight: number,
    blurOptions: ResolvedBlurOptions,
): Promise<{ blurDataURL: string; blurWidth: number; blurHeight: number }> {
```

Keep the `blurFile` / `blurWidth` / `blurHeight` computation exactly as it is, then replace the two sharp calls with:

```ts
    const buffer = await sharp(primaryBuffer)
        .resize({ width: blurWidth, height: blurHeight, fit: "inside" })
        .webp({ quality: blurOptions.quality })
        .toBuffer();

    await writeFile(blurFile, buffer);
```

Update the call in `processVariant` to `makeBlurDataURL(primaryBuffer, primaryFile, width, height, config.blur)`.

Note: the old code wrote the blur file via `sharp(buffer).toFile(blurFile)`, which re-encodes. Writing `buffer` directly changes `*.blur.webp` bytes. That is an expected, deliberate snapshot change — see Step 5.

- [ ] **Step 4: Run the extra-width variants in parallel**

In `processImage`, replace the sequential extra-width `for` loop with:

```ts
    const variants: OptimizedImageVariant[] = [
        defaultVariant,
        ...(await Promise.all(extraTargetWidths.map((width) => processVariant(
            absolutePath, sourceBuffer, publicSrc, targetFile, targetSrc, width,
            sourceWidth, sourceHeight, config, false,
        )))),
    ];
```

- [ ] **Step 5: Run tests; re-baseline only the blur hashes**

```bash
npx vitest run src/image_optimizer/output_identity.test.ts
```

Expected: FAIL on the snapshot, and the diff MUST touch only `*.blur.webp` entries plus `images.json` (whose embedded `blurDataURL` is unchanged in value but the file list order must be identical). Inspect the diff line by line. If any non-blur file hash changed, the parallelization altered output — revert and investigate.

Once the diff is confirmed blur-only:

```bash
npx vitest run src/image_optimizer/output_identity.test.ts -u
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS with 100% per-file coverage on `process_image.ts`. If `process_image.test.ts` asserts on `makeBlurDataURL`'s old signature, update those call sites to pass a buffer read via `readFile(primaryFile)`.

- [ ] **Step 7: Bench and record the win**

```bash
BENCH_JSON="$SCRATCH/bench-task4.json" npm run bench
```

Compare the `processImage: format fan-out` and `width fan-out` means against `$SCRATCH/bench-baseline.json`; put the numbers in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/image_optimizer/process_image.ts src/image_optimizer/process_image.test.ts src/image_optimizer/__snapshots__/output_identity.test.ts.snap
git commit -m "perf: encode formats and widths in parallel, write blur without re-encoding"
```

---

### Task 5: Bounded-concurrency file pool in `run()` and one metadata read per file

**Files:**
- Modify: `package/src/image_optimizer/run.ts`
- Modify: `package/src/image_optimizer/process_image.ts`
- Test: `package/src/image_optimizer/run.test.ts`, `package/src/image_optimizer/output_identity.test.ts`

**Interfaces:**
- Consumes: `processImage(absolutePath, publicRoot, options, root)` from Task 4.
- Produces:
  - `mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>` exported from `run.ts` — results in input order.
  - `processImage(absolutePath, publicRoot, options, root, sourceBuffer?: Buffer)` — optional pre-read source bytes, so `run()` reads each file once.
  - `targetAndSiblingPaths(absolutePath, publicRoot, options, root, sourceBuffer?: Buffer)` — same optional parameter.

- [ ] **Step 1: Write the failing test**

Add to `package/src/image_optimizer/run.test.ts`:

```ts
describe("mapWithConcurrency", () => {
    it("returns results in input order", async () => {
        const delays = [30, 5, 20, 1];
        const result = await mapWithConcurrency(delays, 2, async (ms, i) => {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return i;
        });
        expect(result).toEqual([0, 1, 2, 3]);
    });

    it("never runs more than `limit` workers at once", async () => {
        let active = 0;
        let peak = 0;
        await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
        });
        expect(peak).toBe(2);
    });

    it("treats a limit below 1 as serial", async () => {
        let peak = 0;
        let active = 0;
        await mapWithConcurrency([1, 2, 3], 0, async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active -= 1;
        });
        expect(peak).toBe(1);
    });

    it("handles an empty list", async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });
});
```

Add `mapWithConcurrency` to the existing import from `./run.js` at the top of `run.test.ts`.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/image_optimizer/run.test.ts
```

Expected: FAIL — `mapWithConcurrency is not a function` / import error.

- [ ] **Step 3: Implement the pool**

Add to `package/src/image_optimizer/run.ts`:

```ts
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    const width = Math.max(1, Math.min(limit, items.length));
    let next = 0;

    async function pump(): Promise<void> {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: width }, () => pump()));
    return results;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/image_optimizer/run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Accept a pre-read buffer in `processImage` and `targetAndSiblingPaths`**

In `process_image.ts`, change the `processImage` signature to:

```ts
export async function processImage(
    absolutePath: string,
    publicRoot: string,
    options: ResolvedOptions,
    root: string = path.dirname(publicRoot),
    sourceBuffer?: Buffer,
): Promise<OptimizedImage> {
```

and replace the read with:

```ts
    const source = sourceBuffer ?? await readFile(absolutePath);
    const metadata = await sharp(source).metadata();
```

then pass `source` wherever `processImage` previously passed its own `sourceBuffer` local into `processVariant` (the `processVariant` parameter itself keeps the name `sourceBuffer`).

In `run.ts`, change `targetAndSiblingPaths` to take `sourceBuffer?: Buffer` as a fifth parameter and read metadata from it:

```ts
    const metadata = await sharp(sourceBuffer ?? absolutePath).metadata();
```

- [ ] **Step 6: Replace the serial file loop**

In `run()`, replace the `for (const file of files)` block with:

```ts
    const processed = await mapWithConcurrency(files, options.concurrency, async (file) => {
        const relativeKey = path.relative(root, file);
        const cached = cache[relativeKey];
        const sourceBuffer = await readFile(file);
        const targets = await targetAndSiblingPaths(file, publicRoot, resolvedOptions, root, sourceBuffer);
        const fresh = await isFresh(file, cached, targets);

        if (fresh && cached) {
            return { relativeKey, entry: cached };
        }

        const result = await processImage(file, publicRoot, resolvedOptions, root, sourceBuffer);
        const fileStat = await stat(file);
        return {
            relativeKey,
            entry: { mtimeMs: fileStat.mtimeMs, size: fileStat.size, result },
        };
    });

    const entries: OptimizedImage[] = [];
    for (const { relativeKey, entry } of processed) {
        entries.push(entry.result);
        nextCache[relativeKey] = entry;
    }
```

Add `readFile` to the `node:fs/promises` import in `run.ts`, and delete the now-unused `const entries: OptimizedImage[] = [];` declaration that sat above the old loop.

`options.concurrency` does not exist yet — Task 6 adds it. Until then, use the literal `4` and change it to `options.concurrency` in Task 6 Step 5.

- [ ] **Step 7: Cap sharp's internal thread pool**

At the top of `run.ts`, after the imports, add:

```ts
sharp.concurrency(1);
```

Rationale to record in the commit: outer parallelism now saturates the CPU, so sharp's per-call libvips thread pool oversubscribes it.

- [ ] **Step 8: Verify identity, ordering, and the full suite**

```bash
npx vitest run src/image_optimizer/output_identity.test.ts
npm test
```

Expected: PASS with no snapshot change (order-independent hashing plus in-order results means the manifest is byte-identical). If `images.json` changed, the entry order was not preserved — fix the ordering rather than updating the snapshot.

- [ ] **Step 9: Bench**

```bash
BENCH_JSON="$SCRATCH/bench-task5.json" npm run bench
```

Compare `run(): 12 photos end to end` against `$SCRATCH/bench-baseline.json`. Also try `sharp.concurrency(0)` (libvips default) once by hand and keep whichever is faster; record both numbers in the commit message.

- [ ] **Step 10: Commit**

```bash
git add src/image_optimizer/run.ts src/image_optimizer/run.test.ts src/image_optimizer/process_image.ts
git commit -m "perf: process images with a bounded concurrency pool"
```

---

### Task 6: `concurrency` and `effort` options

**Files:**
- Modify: `package/src/image_optimizer/types.ts`
- Modify: `package/src/image_optimizer/types.test.ts`
- Modify: `package/src/image_optimizer/process_image.ts`
- Modify: `package/src/image_optimizer/run.ts`

**Interfaces:**
- Consumes: `resolveOptions`, `resolveImageConfig`, `DEFAULT_OPTIONS` in `types.ts`.
- Produces:
  - `ImageOptimizerPluginOptions.concurrency?: number` — parallel images in `run()`. Default: `os.cpus().length` clamped to `[1, 8]`.
  - `ImageOptimizerPluginOptions.effort?: number` and `ImageOverrideOptions.effort?: number` — encoder effort (0-9), passed to avif/webp/png/heif/jxl. Default: `undefined`, meaning "sharp's own default", so behavior is unchanged unless set.
  - `ResolvedOptions.concurrency: number`, `ResolvedOptions.effort: number | undefined`, `ResolvedImageConfig.effort: number | undefined`.

- [ ] **Step 1: Write the failing test**

Add to `package/src/image_optimizer/types.test.ts`:

```ts
describe("concurrency and effort options", () => {
    it("defaults concurrency to a clamped cpu count and effort to undefined", () => {
        const resolved = resolveOptions({});
        expect(resolved.concurrency).toBeGreaterThanOrEqual(1);
        expect(resolved.concurrency).toBeLessThanOrEqual(8);
        expect(resolved.effort).toBeUndefined();
    });

    it("honours explicit concurrency and effort", () => {
        const resolved = resolveOptions({ concurrency: 3, effort: 2 });
        expect(resolved.concurrency).toBe(3);
        expect(resolved.effort).toBe(2);
    });

    it("clamps a nonsensical concurrency to at least 1", () => {
        expect(resolveOptions({ concurrency: 0 }).concurrency).toBe(1);
    });

    it("lets a per-image override set effort", () => {
        const options = resolveOptions({ effort: 2, overrides: { "/images/a.png": { effort: 6 } } });
        expect(resolveImageConfig("/images/a.png", options).effort).toBe(6);
        expect(resolveImageConfig("/images/b.png", options).effort).toBe(2);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/image_optimizer/types.test.ts
```

Expected: FAIL — `concurrency`/`effort` do not exist on the resolved type.

- [ ] **Step 3: Add the option types and defaults**

In `types.ts` add `import { cpus } from "node:os";` at the top, add to `ImageOptimizerPluginOptions`:

```ts
    /** Images processed in parallel. Default: cpu count, clamped to 1-8 */
    concurrency?: number;
    /** Encoder effort (0-9) for avif/webp/png/heif/jxl. Default: sharp's own default */
    effort?: number;
```

add to `ImageOverrideOptions`:

```ts
    /** Encoder effort (0-9) for this image. Default: inherits global */
    effort?: number;
```

add `concurrency: number;` and `effort: number | undefined;` to `ResolvedOptions`, and `effort: number | undefined;` to `ResolvedImageConfig`.

In `resolveOptions`'s returned object add:

```ts
        concurrency: Math.max(1, raw.concurrency ?? Math.min(cpus().length, 8)),
        effort: raw.effort,
```

In `resolveImageConfig`, add `effort: options.effort` to the no-override early return, and `effort: override.effort ?? options.effort` to the override return (declaring it alongside `quality`).

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/image_optimizer/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Consume `concurrency` in `run.ts`**

Replace the literal `4` from Task 5 Step 6 with `options.concurrency`.

- [ ] **Step 6: Thread `effort` into the encoders**

In `process_image.ts`, add an `effort: number | undefined` parameter to `encodeFormat` after `quality`, and pass `config.effort` from both `processVariant` call sites (add `effort` to `processVariant`'s `config` parameter type: `{ quality: number; effort: number | undefined; formats: ImageFormat[]; blur: ResolvedBlurOptions }`).

Inside `encodeFormat`, apply effort only where sharp supports it and only when defined:

```ts
    if (format === "avif") {
        encoded = pipeline.avif(effort === undefined ? { quality } : { quality, effort });
    } else if (format === "webp") {
        encoded = pipeline.webp(effort === undefined ? { quality } : { quality, effort });
    } else if (format === "png") {
        encoded = pipeline.png(effort === undefined
            ? { quality, compressionLevel: 9 }
            : { quality, compressionLevel: 9, effort });
    } else if (format === "heif") {
        encoded = pipeline.heif(effort === undefined
            ? { quality, compression: "hevc" }
            : { quality, compression: "hevc", effort });
    } else if (format === "jxl") {
        encoded = pipeline.jxl(effort === undefined ? { quality } : { quality, effort });
    }
```

Leave the `jpeg`, `gif`, `tiff`, `jp2` and `"original"` branches exactly as they are.

- [ ] **Step 7: Cover the new branches**

Add to `package/src/image_optimizer/process_image.test.ts`:

```ts
it("passes effort through to effort-capable encoders", async () => {
    const dir = await makeTempDir();
    const source = await writeFixturePng(path.join(dir, "public", "images"), "e.png", 400, 300);
    const options = resolveOptions({
        formats: ["avif", "webp", "png", "heif", "jxl"],
        effort: 1,
        outDir: "public/generated",
    });
    const result = await processImage(source, path.join(dir, "public"), options, dir);
    expect(result.sources?.length).toBe(5);
    await cleanup(dir);
});
```

If sharp in this environment lacks `jxl` or `heif` support, drop those two from the `formats` array in this test and note it in the commit message — the effort-undefined path for them is already covered by the existing format tests.

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: PASS with 100% per-file coverage for `types.ts`, `process_image.ts`, `run.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/image_optimizer/types.ts src/image_optimizer/types.test.ts src/image_optimizer/process_image.ts src/image_optimizer/process_image.test.ts src/image_optimizer/run.ts
git commit -m "feat: add concurrency and encoder effort options to image optimizer"
```

---

### Task 7: Choose encoder defaults from bench data

**Files:**
- Modify: `package/src/image_optimizer/process_image.bench.ts`
- Modify: `package/src/image_optimizer/types.ts` (only if the data justifies a default change)
- Modify: `package/src/image_optimizer/__snapshots__/output_identity.test.ts.snap` (only if a default changes)

**Interfaces:**
- Consumes: `ResolvedOptions.effort` from Task 6.
- Produces: a decision, recorded in the commit message, on whether `effort` gets a non-`undefined` default.

- [ ] **Step 1: Add a size-vs-time measurement script**

The existing bench measures time only; a default change needs output size too. Create `$SCRATCH/measure_sizes.mjs`:

```js
import sharp from "sharp";

const src = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 240, g: 120, b: 180 } },
}).jpeg().toBuffer();

for (const [label, make] of [
    ["webp effort 0", () => sharp(src).webp({ quality: 80, effort: 0 })],
    ["webp effort 4 (default)", () => sharp(src).webp({ quality: 80 })],
    ["webp effort 6", () => sharp(src).webp({ quality: 80, effort: 6 })],
    ["avif effort 0", () => sharp(src).avif({ quality: 80, effort: 0 })],
    ["avif effort 4 (default)", () => sharp(src).avif({ quality: 80 })],
    ["jpeg baseline", () => sharp(src).jpeg({ quality: 80 })],
    ["jpeg mozjpeg", () => sharp(src).jpeg({ quality: 80, mozjpeg: true })],
    ["resize lanczos3", () => sharp(src).resize({ width: 800 }).webp({ quality: 80 })],
    ["resize mitchell", () => sharp(src).resize({ width: 800, kernel: "mitchell" }).webp({ quality: 80 })],
]) {
    const start = performance.now();
    const out = await make().toBuffer();
    console.log(label, `${(performance.now() - start).toFixed(1)}ms`, `${out.length} bytes`);
}
```

Run it:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
node "$SCRATCH/measure_sizes.mjs"
```

Note: a synthetic flat-color fixture compresses unrealistically well. Also run it against a real photo from `package/public/` or the example app's `public/images/` if one exists, by swapping the `create:` block for `await readFile(<path>)`.

- [ ] **Step 2: Apply the decision rule**

Change a default ONLY if, on the real-photo run, a setting is **>25% faster** for **<5% larger** output. Otherwise keep `effort: undefined` (sharp's defaults) and record the numbers as the justification for not changing anything.

`mozjpeg` and `kernel` stay as they are unless they clear the same bar — they are quality-visible, and `mozjpeg` is the current production setting deliberately.

- [ ] **Step 3: If a default changes, update it and re-baseline**

In `types.ts`'s `DEFAULT_OPTIONS`, set the chosen `effort`, and have `resolveOptions` use `raw.effort ?? DEFAULT_OPTIONS.effort`. Then:

```bash
npx vitest run src/image_optimizer/output_identity.test.ts -u
npm test
```

The snapshot diff here is expected and intentional. Record the before/after byte sizes for each affected output in the commit message.

If no default changes, skip this step entirely.

- [ ] **Step 4: Final bench comparison**

```bash
BENCH_JSON="$SCRATCH/bench-final.json" npm run bench
```

- [ ] **Step 5: Commit**

```bash
git add -A src/image_optimizer
git commit -m "perf: set image encoder defaults from benchmark data"
```

(If nothing changed, commit only the bench file with `docs: record encoder tuning measurements` and put the numbers in the body.)

---

### Task 8: Document and verify

**Files:**
- Modify: `package/README.md`
- Modify: `package/CHANGELOG.md`
- Modify: `package/package.json` (version bump)

**Interfaces:**
- Consumes: the option names from Task 6 — `concurrency`, `effort` (global and per-override).

- [ ] **Step 1: Document the new options**

In `package/README.md`, find the image optimizer options table/list and add rows for `concurrency` (parallel images, default cpu count clamped to 1-8) and `effort` (encoder effort 0-9 for avif/webp/png/heif/jxl, default sharp's own), matching the surrounding formatting exactly. Add `effort` to the per-image overrides section too.

- [ ] **Step 2: Add the changelog entry**

Add a new version section at the TOP of `package/CHANGELOG.md` (newest first, per this repo's convention), covering: single decode per image, parallel format/width encoding, blur written without a second encode, bounded-concurrency file processing, and the new `concurrency`/`effort` options. Include the measured speedup from `$SCRATCH/bench-final.json` vs `$SCRATCH/bench-baseline.json`.

- [ ] **Step 3: Bump the version**

Bump the minor version in `package/package.json` (new options are additive) and run `npm install --package-lock-only` so `package-lock.json` matches — the repo keeps these in sync (see commit `4707b5e`).

- [ ] **Step 4: Full verification**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm test
npm run build
npm run check:exports
npm run check:size
BENCH_JSON="$SCRATCH/bench-final.json" npm run bench
```

Expected: all PASS. Do not claim completion until every one of these has actually been run and its output inspected.

- [ ] **Step 5: Report**

Produce a before/after table: for each bench case, the baseline mean from `$SCRATCH/bench-baseline.json` and the final mean from `$SCRATCH/bench-final.json`, plus the percentage change. State explicitly which output files changed bytes (blur files in Task 4; anything from Task 7) and which did not.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md package.json package-lock.json
git commit -m "docs: document image optimizer concurrency and effort options"
```
