// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadResolvedFirebaseAuth } from "./load_resolved_firebase_auth.js";

describe("loadResolvedFirebaseAuth", () => {
    function setupTempDir(): { dir: string; cleanup: () => void } {
        const dir = mkdtempSync(join(tmpdir(), "vite-load-resolved-"));
        mkdirSync(join(dir, "src", "l18n"), { recursive: true });
        return {
            dir,
            cleanup: () => rmSync(dir, { recursive: true, force: true }),
        };
    }

    it("loads evaluated firebaseAuth object and resolves cloudflare:* and @intl-config", async () => {
        const { dir, cleanup } = setupTempDir();
        try {
            const helperPath = join(dir, "src", "l18n", "helper.ts");
            writeFileSync(helperPath, `
                import config from "@intl-config";
                export const getHasConfig = () => typeof config;
            `);

            const configPath = join(dir, "src", "l18n", "intl_config.ts");
            writeFileSync(configPath, `
                import { env } from "cloudflare:workers";
                import sockets from "cloudflare:sockets";
                import { getHasConfig } from "./helper.js";
                export default {
                    firebaseAuth: {
                        apiKey: "resolved-api-key-" + typeof env + "-" + typeof sockets,
                        projectId: "resolved-proj",
                        helperLoaded: typeof getHasConfig === "function",
                    },
                };
            `);

            const result = await loadResolvedFirebaseAuth({
                intlConfigPath: configPath,
                viteConfig: {
                    root: dir,
                    envDir: dir,
                    mode: "development",
                    resolve: { alias: [] },
                },
            });

            expect(result).toEqual({
                apiKey: "resolved-api-key-object-object",
                projectId: "resolved-proj",
                helperLoaded: true,
            });
        } finally {
            cleanup();
        }
    });

    it("returns undefined when module fails to load or file does not exist", async () => {
        const result = await loadResolvedFirebaseAuth({
            intlConfigPath: "/path/to/nonexistent/config.ts",
            viteConfig: {
                root: "/path/to/nonexistent",
                envDir: "/path/to/nonexistent",
                mode: "development",
                resolve: { alias: [] },
            },
        });
        expect(result).toBeUndefined();

        const resultCreateServerThrows = await loadResolvedFirebaseAuth({
            intlConfigPath: "/path/to/config.ts",
            viteConfig: {
                root: "\0invalid-null-byte-root",
                envDir: "/path/to/nonexistent",
                mode: "development",
                resolve: { alias: [] },
            },
        });
        expect(resultCreateServerThrows).toBeUndefined();
    });

    it("returns undefined when default export is missing or firebaseAuth is not an object", async () => {
        const { dir, cleanup } = setupTempDir();
        try {
            const configPath = join(dir, "src", "l18n", "intl_config.ts");
            writeFileSync(configPath, `
                export default {
                    firebaseAuth: "not-an-object",
                };
            `);

            const result = await loadResolvedFirebaseAuth({
                intlConfigPath: configPath,
                viteConfig: {
                    root: dir,
                    envDir: dir,
                    mode: "development",
                    resolve: { alias: [] },
                },
            });

            expect(result).toBeUndefined();

            writeFileSync(configPath, `
                export default {
                    noAuthHere: true,
                };
            `);

            const resultNoAuth = await loadResolvedFirebaseAuth({
                intlConfigPath: configPath,
                viteConfig: {
                    root: dir,
                    envDir: dir,
                    mode: "development",
                    resolve: { alias: [] },
                },
            });

            expect(resultNoAuth).toBeUndefined();
        } finally {
            cleanup();
        }
    });
});
