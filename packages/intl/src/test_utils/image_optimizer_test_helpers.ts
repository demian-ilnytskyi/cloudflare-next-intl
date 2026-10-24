import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

export async function makeTempDir(): Promise<string> {
    return mkdtemp(path.join(tmpdir(), "cfni-img-test-"));
}

export async function cleanup(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
}

export async function writeFixturePng(
    dir: string,
    filename: string,
    width: number,
    height: number,
): Promise<string> {
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, filename);
    await sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 120, g: 180, b: 240, alpha: 1 },
        },
    })
        .png()
        .toFile(target);
    return target;
}

export async function writeFixtureJpg(
    dir: string,
    filename: string,
    width: number,
    height: number,
): Promise<string> {
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, filename);
    await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 240, g: 120, b: 180 },
        },
    })
        .jpeg()
        .toFile(target);
    return target;
}

export async function hashDir(dir: string, exclude?: RegExp): Promise<Record<string, string>> {
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
            if (exclude?.test(key)) continue;
            result[key] = createHash("sha256").update(await readFile(full)).digest("hex");
        }
    }

    await walk(dir);
    return Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
}
