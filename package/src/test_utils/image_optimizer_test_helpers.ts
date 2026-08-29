import { mkdtemp, mkdir, rm } from "node:fs/promises";
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
