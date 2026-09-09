import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkLayoutQueries } from "../layout_queries_check/index.js";
export function layoutQueriesPlugin(options = {}) {
    let ran = false;
    return {
        name: "cloudflare-next-intl-layout-queries-check",
        enforce: "pre",
        configResolved(config) {
            if (ran)
                return;
            const isBuild = config.command === "build";
            const isDev = config.command === "serve";
            const runOnDev = options.runOnDev ?? true;
            if (!isBuild && !(isDev && runOnDev))
                return;
            const root = config.root || process.cwd();
            const candidateAppDirs = [
                options.appDir,
                resolve(root, "src/app"),
                resolve(root, "app"),
            ].filter((dir) => !!dir && existsSync(dir));
            const appDir = candidateAppDirs[0];
            if (!appDir)
                return;
            ran = true;
            const report = checkLayoutQueries({
                appDir,
                rootDir: root,
                aliases: options.aliases,
                maxDepth: options.maxDepth,
                throwOnError: false,
            });
            if (!report.valid) {
                console.warn(report.formattedMessage);
                if (options.strict) {
                    throw new Error("[cloudflare-next-intl] Build failed: Blocking database queries detected in layout tree. See details above.");
                }
            }
        },
    };
}
