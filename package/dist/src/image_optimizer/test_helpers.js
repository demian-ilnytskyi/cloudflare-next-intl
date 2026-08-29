import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
export async function makeTempDir() {
    return mkdtemp(path.join(tmpdir(), "cfni-img-test-"));
}
export async function cleanup(dir) {
    await rm(dir, { recursive: true, force: true });
}
export async function writeFixturePng(dir, filename, width, height) {
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
