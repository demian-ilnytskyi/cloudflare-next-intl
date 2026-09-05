import type { Plugin } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDynamicPages, type DynamicApiCheck, type DynamicPagesCheckMode, type PageLabelStyle } from "../dynamic_pages_check/index.js";
import { registerBuildWriteRestore } from "./build_write_restore_stack.js";

export interface AutoDynamicPagesPluginOptions {
    /**
     * App directory to scan. Defaults to looking for `src/app` or `app` inside Vite root.
     */
    appDir?: string;
    /**
     * Mode to run checkDynamicPages in. Defaults to `'fix'`.
     */
    mode?: DynamicPagesCheckMode;
    /**
     * Runtime target. Defaults to `'vinext'`.
     */
    target?: 'next' | 'vinext';
    /**
     * Defaults to `false`. Passed straight through to `checkDynamicPages`'s
     * `syncErrorReportingAuthUser` option — see its docs. Opt-in separately
     * from this plugin's own default-on `autoDynamicPages` behavior, since
     * it mutates `reportError()` call-site arguments across your app, not
     * just one `export const dynamic` per page.
     */
    syncErrorReportingAuthUser?: boolean;
    /**
     * Defaults to `[]`. Passed straight through to `checkDynamicPages`'s
     * `extraChecks` option — your own `{ name, pattern }` dynamic-API
     * checks, run alongside the built-in list, for a project-specific
     * helper this scan otherwise has no way to know is dynamic.
     */
    extraChecks?: readonly DynamicApiCheck[];
    /**
     * Defaults to `false`. Passed through to `checkDynamicPages` — prints a
     * route table (page label, route, Static/Dynamic/API) and, for a page
     * forced dynamic, the `(api, file, line)` signals that decided it. Off
     * by default so a normal build stays quiet; turn it on when a page is
     * dynamic and you want to know which import dragged in the signal. Pass
     * `{ pageLabel: ... }` instead of `true` to change how each page's own
     * label is displayed — see `checkDynamicPages`'s `verbose` option.
     */
    verbose?: boolean | { pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string) };
    /**
     * Defaults to `true`. Restores every page file this plugin wrote back to
     * its pre-build contents when the build process exits, so an
     * `export const dynamic` inserted purely to drive THIS build never lands
     * in your working tree or a commit — the build still sees it (it's
     * restored at process exit, long after every build stage has read the
     * file), you just don't have to clean up after it or wire anything extra
     * into your build command.
     *
     * Set `false` to keep the old behavior of leaving the inserted export in
     * the file, i.e. to use this plugin as a one-shot codemod. Files touched
     * by `syncErrorReportingAuthUser` are never restored — that one IS a
     * deliberate source codemod, not a build-time injection.
     */
    restoreAfterBuild?: boolean;
}

/** Actions whose write was a build-time injection, and so is safe to roll back. */
const RESTORABLE_ACTIONS = new Set(['added-force-dynamic', 'added-force-static']);

export function autoDynamicPagesPlugin(options: AutoDynamicPagesPluginOptions = {}): Plugin {
    let ran = false;

    return {
        name: "cloudflare-next-intl-auto-dynamic-pages",
        enforce: "pre",
        async configResolved(config) {
            if (ran) return;
            if (config.command !== "build") return;
            ran = true;

            const root = config.root || process.cwd();
            let appDir = options.appDir;

            if (!appDir) {
                if (existsSync(resolve(root, "src/app"))) {
                    appDir = resolve(root, "src/app");
                } else if (existsSync(resolve(root, "app"))) {
                    appDir = resolve(root, "app");
                }
            }

            if (!appDir || !existsSync(appDir)) {
                return;
            }

            const restoreAfterBuild = options.restoreAfterBuild ?? true;
            // Captured BEFORE the first write to each file, so a restore puts
            // back what the developer actually has on disk.
            const originals = new Map<string, string>();

            try {
                const reports = await checkDynamicPages({
                    appDir,
                    mode: options.mode ?? "fix",
                    target: options.target ?? "vinext",
                    syncErrorReportingAuthUser: options.syncErrorReportingAuthUser ?? false,
                    extraChecks: options.extraChecks ?? [],
                    verbose: options.verbose ?? false,
                }, restoreAfterBuild
                    ? {
                        writeFile: (file: string, contents: string) => {
                            if (!originals.has(file)) {
                                try {
                                    originals.set(file, readFileSync(file, "utf8"));
                                } catch {
                                    // Unreadable means unrestorable; write anyway.
                                }
                            }
                            writeFileSync(file, contents, "utf8");
                        },
                    }
                    : undefined);

                if (!restoreAfterBuild) return;

                const restorable = new Set(
                    reports
                        .filter((report) => RESTORABLE_ACTIONS.has(String((report as { action?: unknown }).action)))
                        .map((report) => report.file),
                );
                for (const file of [...originals.keys()]) {
                    if (!restorable.has(file)) originals.delete(file);
                }
                registerBuildWriteRestore(originals);
            } catch (err) {
                console.warn("[cloudflare-next-intl] autoDynamicPages check error:", err);
            }
        },
    };
}
