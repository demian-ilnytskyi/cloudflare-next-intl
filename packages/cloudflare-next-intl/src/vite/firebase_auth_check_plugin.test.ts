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
    it("throws on build by default when a required field's env var is unset, resolving the default config path", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(callConfigResolved(
                firebaseAuthCheckPlugin({ env: {} }),
                { command: "build", root: dir } as ResolvedConfig,
            )).rejects.toThrow(/`firebaseAuth` config is incomplete/);
            const output = warn.mock.calls.flat().join(" ");
            expect(output).toContain("INCOMPLETE `firebaseAuth` CONFIG");
            expect(output).toContain("firebaseAuth.apiKey");
            expect(output).toContain("Set API_KEY");
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("only logs, never throws, when strict is false", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await callConfigResolved(
                firebaseAuthCheckPlugin({ env: {}, strict: false }),
                { command: "build", root: dir } as ResolvedConfig,
            );
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("runs on dev too, and not at all when runOnDev is false", async () => {
        const dir = projectWith(incomplete);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(callConfigResolved(
                firebaseAuthCheckPlugin({ env: {} }),
                { command: "serve", root: dir } as ResolvedConfig,
            )).rejects.toThrow();
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
            const plugin = firebaseAuthCheckPlugin({ env: {}, strict: false });
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

    it("actually evaluates a real, resolvable config through the SSR module loader and reports the true value — not a same-named field's text nearby", async () => {
        // Reproduces the exact shape that broke the old static scanner: a
        // top-level `appId` supplied via `...firebaseConfig` (a spread from
        // ANOTHER file, imported by relative path) alongside a
        // differently-sourced, separately-nested `appCheck.appId`. A blind
        // text search for "appId:" found the nested one first and
        // misreported it as the top-level field's source. Evaluating the
        // real module sidesteps that class of bug entirely: there's no text
        // to confuse, only two distinct real values.
        const dir = mkdtempSync(join(tmpdir(), "vite-fa-check-real-"));
        mkdirSync(join(dir, "src", "l18n"), { recursive: true });
        mkdirSync(join(dir, "src", "shared"), { recursive: true });
        writeFileSync(join(dir, "src", "shared", "firebase_client_provider.ts"), `
            export const firebaseConfig = {
                apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
                authDomain: 'd',
                projectId: 'p',
                appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            };
        `);
        writeFileSync(join(dir, "src", "l18n", "intl_config.ts"), `
            function setIntlConfig(c) { return c; }
            import { firebaseConfig } from "../shared/firebase_client_provider.js";
            export default setIntlConfig({ firebaseAuth: {
                ...firebaseConfig,
                redirectAuthPath: '/login', homePath: '/',
                appCheck: {
                    clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
                    appId: process.env.FIREBASE_APP_ID,
                },
            } });
        `);

        const previousApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
        const previousAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "real-key";
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "real-app-id";
        delete process.env.FIREBASE_APP_ID;
        delete process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL;

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await callConfigResolved(
                firebaseAuthCheckPlugin({ env: {}, strict: false }),
                { command: "build", root: dir } as ResolvedConfig,
            );
            const output = warn.mock.calls.flat().join(" ");
            expect(output).not.toContain("firebaseAuth.appId");
            expect(output).toContain("firebaseAuth.appCheck.appId");
            expect(output).toContain("firebaseAuth.appCheck.clientEmail");
        } finally {
            warn.mockRestore();
            if (previousApiKey === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
            else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previousApiKey;
            if (previousAppId === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
            else process.env.NEXT_PUBLIC_FIREBASE_APP_ID = previousAppId;
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
