import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { autoLocaleParamsPlugin } from "./auto_locale_params_plugin.js";

const TEST_DIR = resolve(__dirname, "../../.test_tmp_auto_locale_params");
const ZERO_ARG_PAGE = `export default function Page() { return <div>Hello</div>; }\n`;

describe("autoLocaleParamsPlugin", () => {
    beforeEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(resolve(TEST_DIR, "src/app/[locale]"), { recursive: true });
    });

    afterEach(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it("automatically inserts locale-param setup during configResolved (build)", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
        // @ts-expect-error Idempotency check: second invocation returns early
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain("params: Promise<{ locale: Language }>;");
        expect(content).toContain("setLocale(locale);");
    });

    it("does nothing during dev by default (command: 'serve')", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "serve" });

        expect(readFileSync(pagePath, "utf8")).toBe(ZERO_ARG_PAGE);
    });

    it("runs during dev when runOnDev is true (write persists — dev never registers an exit-based restore)", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin({ runOnDev: true });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "serve" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain("setLocale(locale);");
        // Deliberately no `process.emit("exit")` here: other tests in this
        // file register their own build-time exit-restore handlers against
        // the same TEST_DIR path, and `process.once("exit", ...)` handlers
        // persist for the life of the test worker — emitting "exit" here
        // would also fire THEIR still-pending handlers and restore an
        // unrelated test's captured content onto this file, not a real
        // behavior of the dev path under test.
    });

    it("supports fallback to app/ directory if src/app does not exist", async () => {
        rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(resolve(TEST_DIR, "app/[locale]"), { recursive: true });
        const pagePath = resolve(TEST_DIR, "app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain("setLocale(locale);");
    });

    it("respects explicit appDir, mode, and localeParam options", async () => {
        mkdirSync(resolve(TEST_DIR, "src/app/[lang]"), { recursive: true });
        const pagePath = resolve(TEST_DIR, "src/app/[lang]/page.tsx");
        writeFileSync(pagePath, `export default async function Page({ params }: { params: Promise<{ lang: Language }> }) {\n    const { lang } = await params;\n}\n`, "utf8");

        const plugin = autoLocaleParamsPlugin({
            appDir: resolve(TEST_DIR, "src/app"),
            mode: "fix",
            localeParam: "lang",
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ command: "build" });

        const content = readFileSync(pagePath, "utf8");
        expect(content).toContain("setLocale(lang);");
    });

    it("does nothing when appDir does not exist", async () => {
        const plugin = autoLocaleParamsPlugin({
            appDir: resolve(TEST_DIR, "non_existent_app_dir"),
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
    });

    it("handles error in checkLocaleParams gracefully", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const checkLocaleParamsModule = await import("../locale_params_check/check_locale_params.js");
        const spy = vi.spyOn(checkLocaleParamsModule, "checkLocaleParams").mockRejectedValueOnce(new Error("Test error"));

        const plugin = autoLocaleParamsPlugin({
            appDir: resolve(TEST_DIR, "src/app"),
        });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "[cloudflare-next-intl] autoLocaleParams check error:",
            expect.any(Error)
        );
        spy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it("does nothing when neither src/app nor app exist in root", async () => {
        rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(TEST_DIR, { recursive: true });

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });
    });

    it("falls back to process.cwd() when config.root is empty", async () => {
        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ command: "build" });
    });

    it("restores the rewritten page file to its original contents on process exit (default restoreAfterBuild)", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        expect(readFileSync(pagePath, "utf8")).toContain("setLocale(locale);");

        process.emit("exit", 0);

        expect(readFileSync(pagePath, "utf8")).toBe(ZERO_ARG_PAGE);
    });

    it("leaves the inserted setup in place when restoreAfterBuild is false", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin({ restoreAfterBuild: false });
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const afterBuild = readFileSync(pagePath, "utf8");
        expect(afterBuild).toContain("setLocale(locale);");

        process.emit("exit", 0);

        expect(readFileSync(pagePath, "utf8")).toBe(afterBuild);
    });

    it("also restores on SIGINT/SIGTERM before re-raising the signal", async () => {
        const pagePath = resolve(TEST_DIR, "src/app/[locale]/page.tsx");
        writeFileSync(pagePath, ZERO_ARG_PAGE, "utf8");

        const plugin = autoLocaleParamsPlugin();
        // @ts-expect-error Mock Vite configResolved hook call
        await plugin.configResolved?.({ root: TEST_DIR, command: "build" });

        const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
        process.emit("SIGINT");

        expect(readFileSync(pagePath, "utf8")).toBe(ZERO_ARG_PAGE);
        expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGINT");
        killSpy.mockRestore();
    });
});
