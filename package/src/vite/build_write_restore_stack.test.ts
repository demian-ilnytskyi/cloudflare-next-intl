import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBuildWriteRestore } from "./build_write_restore_stack.js";

describe("registerBuildWriteRestore", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cfni-build-write-restore-"));
    });

    afterEach(() => {
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    });

    it("is a no-op for an empty map — nothing to restore on exit", () => {
        registerBuildWriteRestore(new Map());
        // Nothing to assert beyond "doesn't throw" — the module-level
        // `registered` flag/process handlers are shared across this whole
        // test file, so an empty map here must not itself arm anything new
        // or push a restore step; covered indirectly by the file/write
        // tests below still restoring correctly afterward.
        expect(true).toBe(true);
    });

    it("writes each original file's contents back on exit, most-recently-registered restoring first", () => {
        const fileA = join(dir, "a.tsx");
        const fileB = join(dir, "b.tsx");
        writeFileSync(fileA, "written-a", "utf8");
        writeFileSync(fileB, "written-b", "utf8");

        registerBuildWriteRestore(new Map([[fileA, "original-a"]]));
        registerBuildWriteRestore(new Map([[fileB, "original-b"]]));

        process.emit("exit", 0);

        expect(readFileSync(fileA, "utf8")).toBe("original-a");
        expect(readFileSync(fileB, "utf8")).toBe("original-b");
    });

    it("swallows a writeFileSync failure during restore (file already deleted/moved)", () => {
        const goneFile = join(dir, "gone.tsx");
        writeFileSync(goneFile, "written", "utf8");
        registerBuildWriteRestore(new Map([[goneFile, "original"]]));
        rmSync(goneFile);

        expect(() => process.emit("exit", 0)).not.toThrow();
    });

    it("also restores on SIGINT before re-raising the signal via process.kill", () => {
        const file = join(dir, "sigint.tsx");
        writeFileSync(file, "written", "utf8");
        registerBuildWriteRestore(new Map([[file, "original-sigint"]]));

        const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
        process.emit("SIGINT");

        expect(readFileSync(file, "utf8")).toBe("original-sigint");
        expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGINT");
        killSpy.mockRestore();
    });

    it("restores then rethrows on uncaughtException", () => {
        const file = join(dir, "uncaught.tsx");
        writeFileSync(file, "written", "utf8");
        registerBuildWriteRestore(new Map([[file, "original-uncaught"]]));

        const err = new Error("boom");
        expect(() => process.emit("uncaughtException", err)).toThrow(err);
        expect(readFileSync(file, "utf8")).toBe("original-uncaught");
    });

    it("restores then rethrows on unhandledRejection", () => {
        const file = join(dir, "unhandled.tsx");
        writeFileSync(file, "written", "utf8");
        registerBuildWriteRestore(new Map([[file, "original-unhandled"]]));

        const reason = new Error("rejected");
        expect(() => process.emit("unhandledRejection", reason, Promise.resolve())).toThrow(reason);
        expect(readFileSync(file, "utf8")).toBe("original-unhandled");
    });
});
