import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkDynamicPages, type DynamicPagesCheckMode } from "../dynamic_pages_check/index.js";

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
}

export function autoDynamicPagesPlugin(options: AutoDynamicPagesPluginOptions = {}): Plugin {
    let ran = false;

    return {
        name: "cloudflare-next-intl-auto-dynamic-pages",
        enforce: "pre",
        async configResolved(config) {
            if (ran) return;
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

            try {
                await checkDynamicPages({
                    appDir,
                    mode: options.mode ?? "fix",
                    target: options.target ?? "vinext",
                    syncErrorReportingAuthUser: options.syncErrorReportingAuthUser ?? false,
                });
            } catch (err) {
                console.warn("[cloudflare-next-intl] autoDynamicPages check error:", err);
            }
        },
    };
}
