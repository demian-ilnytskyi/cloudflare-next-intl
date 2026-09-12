import type { Plugin } from "vite";
import {
    checkFirebaseAuthConfig,
    validateFirebaseAuthConfigValues,
    loadResolvedFirebaseAuth,
    type CheckFirebaseAuthConfigOptions,
} from "../firebase_auth_check/index.js";
import { resolveDefaultIntlConfigPath } from "./locale_file_plugin.js";

export interface FirebaseAuthCheckPluginOptions
    extends Pick<CheckFirebaseAuthConfigOptions, "intlConfigPath" | "env"> {
    /**
     * Fail the build/dev startup when a required field is missing.
     * Defaults to `true` so a genuinely incomplete `firebaseAuth` config
     * cannot ship silently. Pass `false` to only print the terminal warning
     * (log-only) and let the build continue — e.g. for a half-configured
     * local checkout.
     * @default true
     */
    strict?: boolean;

    /**
     * Run on `vite dev` too, not only `vite build`.
     * @default true
     */
    runOnDev?: boolean;
}

/**
 * Validates the `firebaseAuth` block of the `@intl-config` file once, at
 * Vite config-resolve time, on both `vite dev` and `vite build` — so an
 * unset `FIREBASE_SERVICE_ACCOUNT_*` env var or a missing required field is
 * a terminal message during development instead of a production-only
 * "signed-in user renders as signed-out".
 *
 * Primarily validates the REAL, evaluated `firebaseAuth` object — actually
 * importing `@intl-config` through a throwaway Vite SSR module loader (see
 * `loadResolvedFirebaseAuth`) and checking what its fields resolve to,
 * rather than pattern-matching source text for `process.env.X` reads. That
 * static scan (`checkFirebaseAuthConfig`) is kept only as a fallback for
 * when the module can't actually be loaded (a syntax error, a resolution
 * failure, ...) — degraded diagnostics (no exact env-var name or line
 * number) beat no check at all.
 *
 * No-op when the config has no `firebaseAuth` block.
 */
export function firebaseAuthCheckPlugin(options: FirebaseAuthCheckPluginOptions = {}): Plugin {
    let ran = false;

    return {
        name: "cloudflare-next-intl-firebase-auth-check",
        enforce: "pre",
        async configResolved(config) {
            if (ran) return;
            const isBuild = config.command === "build";
            const isDev = config.command === "serve";
            if (!isBuild && !(isDev && (options.runOnDev ?? true))) return;

            ran = true;

            const root = config.root || process.cwd();
            const intlConfigPath = options.intlConfigPath ?? resolveDefaultIntlConfigPath(root);
            let env = options.env;
            if (!env) {
                // Imported lazily: `vite`'s entry pulls in esbuild, and this
                // module is reached from `plugin.ts`, which is imported by
                // tests running under jsdom where esbuild refuses to load.
                // Only the hook (never the import) needs it.
                const { loadEnv } = await import("vite");
                env = {
                    // An empty prefix returns every var in `.env*`, including
                    // the non-`NEXT_PUBLIC_` secrets the `appCheck` fields
                    // read; `process.env` still wins for vars exported by the
                    // shell / CI.
                    ...loadEnv(config.mode, config.envDir || root, ""),
                    ...process.env,
                };
            }

            // The evaluated module's own `process.env.X` reads only see
            // what's already in the real process env — merge the `.env*`
            // values in too (temporarily; restored right after) so a value
            // that only exists in a dotenv file is seen exactly like a real
            // shell/CI-exported one, matching Next.js's own env-file
            // behavior.
            const previousEnv = { ...process.env };
            Object.assign(process.env, env);
            let firebaseAuth: Record<string, unknown> | undefined;
            try {
                firebaseAuth = await loadResolvedFirebaseAuth({
                    intlConfigPath,
                    viteConfig: { root: config.root, envDir: config.envDir, mode: config.mode, resolve: { alias: config.resolve?.alias } },
                });
            } finally {
                process.env = previousEnv;
            }

            const report = firebaseAuth !== undefined
                ? validateFirebaseAuthConfigValues({ firebaseAuth, intlConfigPath })
                : checkFirebaseAuthConfig({ intlConfigPath, env, throwOnError: false });
            if (report.issues.length === 0) return;

            console.warn(report.formattedMessage);

            if (!report.valid && options.strict !== false) {
                throw new Error(
                    "[cloudflare-next-intl] Build failed: `firebaseAuth` config is incomplete. See details above.",
                );
            }
        },
    };
}
