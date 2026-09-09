import type { Plugin } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkLocaleParams, type LocaleParamsCheckMode } from "../locale_params_check/check_locale_params.js";
import type { PageLabelStyle } from "../dynamic_pages_check/derive_page_label.js";
import { registerBuildWriteRestore } from "./build_write_restore_stack.js";

export interface AutoLocaleParamsPluginOptions {
    /** App directory to scan. Defaults to looking for `src/app` or `app` inside Vite root. */
    appDir?: string;
    /** Mode to run `checkLocaleParams` in. Defaults to `'fix'`. */
    mode?: LocaleParamsCheckMode;
    /** The dynamic segment name your `[locale]`-style folder uses. Defaults to `'locale'`. */
    localeParam?: string;
    /** Passed straight through to `checkLocaleParams`'s `skip` option. */
    skip?: readonly string[];
    /** Passed straight through to `checkLocaleParams`'s `overrides` option. */
    overrides?: Readonly<Record<string, { localeParam?: string }>>;
    /**
     * Defaults to `false` — this plugin only runs during `vite build`. Set
     * `true` to also run it during `vite dev`, so locale-param setup (and
     * the resulting `force-static`/`force-dynamic` distinction it feeds into
     * `checkDynamicPages`) is visible immediately in dev too, not only
     * discovered at build time.
     */
    runOnDev?: boolean;
    /**
     * Defaults to `true`. Restores every file this plugin wrote back to its
     * pre-build contents when the build process exits, so a locale-param
     * setup inserted purely to drive THIS build never lands in your working
     * tree or a commit — mirrors `autoDynamicPagesPlugin`'s
     * `restoreAfterBuild` behavior for the same reason. Set `false` to keep
     * the old behavior of leaving the inserted setup in the file, i.e. to
     * use this plugin as a one-shot codemod. Has no effect when `runOnDev`
     * is the only reason the check ran (dev never restores mid-session —
     * see below).
     */
    restoreAfterBuild?: boolean;
    /**
     * Defaults to `false`. Passed through to `checkLocaleParams` — prints a
     * block per scanned file (label, route, and why it was/wasn't given
     * locale-param setup). Off by default so a normal build stays quiet;
     * turn it on to see which pages are missing setup and why.
     */
    verbose?: boolean | { pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string) };
}

/** Actions whose write was a build-time injection, and so is safe to roll back. */
const RESTORABLE_ACTIONS = new Set(['added-locale-params']);

export function autoLocaleParamsPlugin(options: AutoLocaleParamsPluginOptions = {}): Plugin {
    let ran = false;

    return {
        name: "cloudflare-next-intl-auto-locale-params",
        enforce: "pre",
        async configResolved(config) {
            if (ran) return;
            const isBuild = config.command === "build";
            const isDev = config.command === "serve";
            if (!isBuild && !(isDev && options.runOnDev)) return;
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

            if (!appDir || !existsSync(appDir)) return;

            // A dev server keeps running long after `configResolved`, so
            // there's no single "done" moment to restore at — leaving the
            // inserted setup in place while the server is up is the only
            // sensible dev behavior. Only a build (a one-shot process) ever
            // restores.
            const restoreAfterBuild = isBuild && (options.restoreAfterBuild ?? true);
            const originals = new Map<string, string>();

            try {
                const reports = await checkLocaleParams({
                    appDir,
                    mode: options.mode ?? "fix",
                    localeParam: options.localeParam,
                    skip: options.skip,
                    overrides: options.overrides,
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
                        .filter((report) => RESTORABLE_ACTIONS.has(report.action))
                        .map((report) => report.file),
                );
                for (const file of [...originals.keys()]) {
                    if (!restorable.has(file)) originals.delete(file);
                }
                registerBuildWriteRestore(originals);
            } catch (err) {
                console.warn("[cloudflare-next-intl] autoLocaleParams check error:", err);
            }
        },
    };
}
