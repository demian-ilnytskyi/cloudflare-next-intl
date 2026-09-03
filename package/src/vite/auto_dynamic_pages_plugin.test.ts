import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { autoDynamicPagesPlugin } from "./auto_dynamic_pages_plugin.js";

const TEST_DIR = resolve(__dirname, "../../.test_tmp_auto_dynamic");

describe("autoDynamicPagesPlugin", () => {
    beforeEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(resolve(TEST_DIR, "src/app/[locale]"), { recursive: true });
    });

    afterEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it("automatically inserts export const dynamic = 'force-static' during configResolved", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
        // @ts-expect-error Idempotency check: second invocation returns early
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain('export const dynamic = "force-static";');
    });

    it("does nothing during dev (command: 'serve')", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        const original = `export default function Page() { return <div>Hello</div>; }\n`;
        writeFileSync(pagePath, original, "utf8");

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "serve" });

        expect(readFileSync(pagePath, "utf8")).toBe(original);
    });

    it("supports fallback to app/ directory if src/app does not exist", async () => {
        rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(resolve(TEST_DIR, "app/[locale]"), { recursive: true });
        const pagePath = resolve(TEST_DIR, "app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain('export const dynamic = "force-static";');
    });

    it("respects explicit appDir, mode, and target options", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const plugin = autoDynamicPagesPlugin({
            appDir: resolve(TEST_DIR, "src/app"),
            mode: "fix",
            target: "vinext",
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain('export const dynamic = "force-static";');
    });

    it("passes syncErrorReportingAuthUser through to checkDynamicPages, defaulting to false", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const checkDynamicPagesModule = await import("../dynamic_pages_check/index.js");
        const spy = vi.spyOn(checkDynamicPagesModule, "checkDynamicPages");

        const plugin = autoDynamicPagesPlugin({ syncErrorReportingAuthUser: true });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ syncErrorReportingAuthUser: true }),
            expect.anything(),
        );
        spy.mockRestore();
    });

    it("does nothing when appDir does not exist", async () => {
        const plugin = autoDynamicPagesPlugin({
            appDir: resolve(TEST_DIR, "non_existent_app_dir"),
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
    });

    it("handles error in checkDynamicPages gracefully", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const checkDynamicPagesModule = await import("../dynamic_pages_check/index.js");
        const spy = vi.spyOn(checkDynamicPagesModule, "checkDynamicPages").mockRejectedValueOnce(new Error("Test error"));

        const plugin = autoDynamicPagesPlugin({
            appDir: resolve(TEST_DIR, "src/app"),
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "[cloudflare-next-intl] autoDynamicPages check error:",
            expect.any(Error)
        );
        spy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it("does nothing when neither src/app nor app exist in root", async () => {
        rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(TEST_DIR, { recursive: true });

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
    });

    it("falls back to process.cwd() when config.root is empty", async () => {
        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ command: "build" });
    });

    it("restores each rewritten page file to its original contents on process exit (default restoreAfterBuild)", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        const original = `export default function Page() { return <div>Hello</div>; }\n`;
        writeFileSync(pagePath, original, "utf8");

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        expect(readFileSync(pagePath, "utf8")).toContain('export const dynamic = "force-static";');

        process.emit("exit", 0);

        expect(readFileSync(pagePath, "utf8")).toBe(original);
    });

    it("leaves the inserted export in place when restoreAfterBuild is false", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, `export default function Page() { return <div>Hello</div>; }\n`, "utf8");

        const plugin = autoDynamicPagesPlugin({ restoreAfterBuild: false });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const afterBuild = readFileSync(pagePath, "utf8");
        expect(afterBuild).toContain('export const dynamic = "force-static";');

        process.emit("exit", 0);

        expect(readFileSync(pagePath, "utf8")).toBe(afterBuild);
    });

    it("also restores on SIGINT/SIGTERM before re-raising the signal", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        const original = `export default function Page() { return <div>Hello</div>; }\n`;
        writeFileSync(pagePath, original, "utf8");

        const plugin = autoDynamicPagesPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        // process.kill is stubbed here — emitting the real signal would
        // otherwise re-raise it against this very test process via the
        // handler under test and terminate it.
        const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
        process.emit("SIGINT");

        expect(readFileSync(pagePath, "utf8")).toBe(original);
        expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGINT");
        killSpy.mockRestore();
    });
});
