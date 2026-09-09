// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "vite";
import { firebaseAuthCheckPlugin } from "./firebase_auth_check_plugin.js";

async function callConfigResolved(plugin: ReturnType<typeof firebaseAuthCheckPlugin>, config: ResolvedConfig): Promise<void> {
    const hook = plugin.configResolved;
    if (typeof hook === "function") {
        await (hook as (config: ResolvedConfig) => Promise<void>)(config);
    }
}

function projectWith(config: string): string {
    const dir = mkdtempSync(join(tmpdir(), "vite-fa-check-"));
    mkdirSync(join(dir, "src", "l18n"), { recursive: true });
    writeFileSync(join(dir, "src", "l18n", "intl_config.ts"), config);
    return dir;
}

const incomplete = `setIntlConfig({ firebaseAuth: {
    apiKey: process.env.API_KEY!, authDomain: 'd', projectId: 'p', appId: 'a',
    redirectAuthPath: '/login', homePath: '/',
} })`;

const complete = `setIntlConfig({ firebaseAuth: {
    apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a',
    redirectAuthPath: '/login', homePath: '/',
} })`;

describe("firebaseAuthCheckPlugin", () => {
    it("warns on build when a required field's env var is unset, resolving the default config path", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await callConfigResolved(firebaseAuthCheckPlugin({ env: {} }), { command: "build", root: dir } as ResolvedConfig);
            const output = warn.mock.calls.flat().join(" ");
            expect(output).toContain("INCOMPLETE `firebaseAuth` CONFIG");
            expect(output).toContain("firebaseAuth.apiKey");
            expect(output).toContain("Set API_KEY");
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("runs on dev too, and not at all when runOnDev is false", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await callConfigResolved(firebaseAuthCheckPlugin({ env: {} }), { command: "serve", root: dir } as ResolvedConfig);
            expect(warn).toHaveBeenCalled();

            warn.mockClear();
            await callConfigResolved(
                firebaseAuthCheckPlugin({ env: {}, runOnDev: false }),
                { command: "serve", root: dir } as ResolvedConfig,
            );
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("runs only once across repeated configResolved calls", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const plugin = firebaseAuthCheckPlugin({ env: {} });
            await callConfigResolved(plugin, { command: "build", root: dir } as ResolvedConfig);
            await callConfigResolved(plugin, { command: "build", root: dir } as ResolvedConfig);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("throws in strict mode, but only for errors", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(callConfigResolved(
                firebaseAuthCheckPlugin({ env: {}, strict: true }),
                { command: "build", root: dir } as ResolvedConfig,
            )).rejects.toThrow(/`firebaseAuth` config is incomplete/);
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("stays silent for a complete config and for a project with no config file", async () => {
        const dir = projectWith(complete);
        const empty = mkdtempSync(join(tmpdir(), "vite-fa-check-empty-"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await callConfigResolved(firebaseAuthCheckPlugin({ env: {} }), { command: "build", root: dir } as ResolvedConfig);
            await callConfigResolved(firebaseAuthCheckPlugin({ env: {} }), { command: "build", root: empty } as ResolvedConfig);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
            rmSync(empty, { recursive: true, force: true });
        }
    });

    it("resolves env vars from .env files, not only process.env", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            writeFileSync(join(dir, ".env"), "API_KEY=from-dotenv\n");
            await callConfigResolved(
                firebaseAuthCheckPlugin({}),
                { command: "build", root: dir, mode: "production", envDir: dir } as ResolvedConfig,
            );
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
