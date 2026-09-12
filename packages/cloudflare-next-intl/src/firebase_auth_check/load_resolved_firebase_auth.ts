import type { ResolvedConfig } from "vite";

export interface LoadResolvedFirebaseAuthOptions {
    /** Path to the file exporting `setIntlConfig({...})` (the `@intl-config` target). */
    intlConfigPath: string;
    /**
     * Only the pieces of the OUTER (real) Vite config the inner loader
     * needs: `root`/`envDir`/`mode` so it reads the same `.env*` files the
     * real app does, and `resolve.alias` so a `@/...`-style import inside
     * `intl_config.ts` (or whatever it imports in turn) resolves exactly the
     * way the real build resolves it.
     */
    viteConfig: Pick<ResolvedConfig, "root" | "envDir" | "mode"> & {
        resolve: Pick<ResolvedConfig["resolve"], "alias">;
    };
}

/**
 * Actually imports `@intl-config` and reads off its default export's
 * `firebaseAuth` field — the real, evaluated object, not text guessed at by
 * a source scan. A plain Node `import()` can't do this: the file is
 * TypeScript and typically imports further app code through the same path
 * aliases the real app relies on Vite to resolve, which Node has no idea
 * about on its own. A throwaway Vite SSR module loader, seeded with the
 * real app's `root`/`resolve.alias`/`envDir`, resolves and transforms it
 * exactly like the real dev server or build would.
 *
 * Returns `undefined` (never throws) when the module can't be loaded, has no
 * default export, or that export has no `firebaseAuth` object — the caller
 * decides how to degrade (e.g. falling back to the static-text scan).
 */
export async function loadResolvedFirebaseAuth(
    options: LoadResolvedFirebaseAuthOptions,
): Promise<Record<string, unknown> | undefined> {
    let server: Awaited<ReturnType<typeof import("vite").createServer>> | undefined;
    try {
        const { createServer } = await import("vite");
        server = await createServer({
            configFile: false,
            root: options.viteConfig.root,
            envDir: options.viteConfig.envDir,
            mode: options.viteConfig.mode,
            resolve: { alias: options.viteConfig.resolve.alias },
            server: { middlewareMode: true, hmr: false, watch: null },
            optimizeDeps: { noDiscovery: true },
            logLevel: "silent",
            clearScreen: false,
            // Vite's SSR module runner externalizes `node_modules` deps to
            // Node's native resolver by default, bypassing every plugin's
            // resolveId/load hooks (including the "@intl-config" alias just
            // below) — this package's own internals (e.g.
            // report_client_error_action.js) import "@intl-config" too, so
            // without this they'd hit Node's resolver and fail with
            // "Invalid module '@intl-config'".
            ssr: { noExternal: ["cloudflare-next-intl", /^cloudflare:/] },
            plugins: [
                {
                    // cloudflare-next-intl's own internals (e.g.
                    // report_client_error_action.js) import "@intl-config" to
                    // get back the user's own config — normally supplied by
                    // this package's `localeFilePlugin`, which isn't part of
                    // this throwaway server's minimal plugin set. Since we
                    // already know exactly which file that virtual specifier
                    // must point at, just alias it directly rather than
                    // pulling in the full plugin (and everything else it
                    // wires up) only for this one resolution.
                    name: "cfni:firebase-auth-check-intl-config-alias",
                    enforce: "pre",
                    resolveId(id) {
                        if (id === "@intl-config") return options.intlConfigPath;
                        if (id === "cloudflare:workers" || id.startsWith("cloudflare:")) {
                            return "\0cfni:cloudflare-workers-stub";
                        }
                    },
                    load(id) {
                        if (id === "\0cfni:cloudflare-workers-stub") {
                            return (
                                "export class WorkerEntrypoint {}\n" +
                                "export class DurableObject {}\n" +
                                "export const env = {};\n" +
                                "export default {};\n"
                            );
                        }
                    },
                },
            ],
        });

        const mod = await server.ssrLoadModule(options.intlConfigPath);
        const exported = (mod as { default?: unknown }).default;
        const firebaseAuth = (exported as { firebaseAuth?: unknown } | undefined)?.firebaseAuth;
        return firebaseAuth && typeof firebaseAuth === "object"
            ? (firebaseAuth as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    } finally {
        await server?.close();
    }
}
