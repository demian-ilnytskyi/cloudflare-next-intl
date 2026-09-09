import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDynamicPages } from "../dynamic_pages_check/index.js";
import { registerBuildWriteRestore } from "./build_write_restore_stack.js";
const RESTORABLE_ACTIONS = new Set(['added-force-dynamic', 'added-force-static']);
export function autoDynamicPagesPlugin(options = {}) {
    let ran = false;
    return {
        name: "cloudflare-next-intl-auto-dynamic-pages",
        enforce: "pre",
        async configResolved(config) {
            if (ran)
                return;
            if (config.command !== "build")
                return;
            ran = true;
            const root = config.root || process.cwd();
            let appDir = options.appDir;
            if (!appDir) {
                if (existsSync(resolve(root, "src/app"))) {
                    appDir = resolve(root, "src/app");
                }
                else if (existsSync(resolve(root, "app"))) {
                    appDir = resolve(root, "app");
                }
            }
            if (!appDir || !existsSync(appDir)) {
                return;
            }
            const restoreAfterBuild = options.restoreAfterBuild ?? true;
            const originals = new Map();
            try {
                const reports = await checkDynamicPages({
                    appDir,
                    projectRoot: root,
                    mode: options.mode ?? "fix",
                    target: options.target ?? "vinext",
                    includeLoading: options.includeLoading ?? false,
                    verifyVinextRouteWiring: options.verifyVinextRouteWiring ?? true,
                    syncErrorReportingAuthUser: options.syncErrorReportingAuthUser ?? false,
                    extraChecks: options.extraChecks ?? [],
                    verbose: options.verbose ?? false,
                }, restoreAfterBuild
                    ? {
                        writeFile: (file, contents) => {
                            if (!originals.has(file)) {
                                try {
                                    originals.set(file, readFileSync(file, "utf8"));
                                }
                                catch {
                                }
                            }
                            writeFileSync(file, contents, "utf8");
                        },
                    }
                    : undefined);
                if (!restoreAfterBuild)
                    return;
                const restorable = new Set(reports
                    .filter((report) => RESTORABLE_ACTIONS.has(String(report.action)))
                    .map((report) => report.file));
                for (const file of [...originals.keys()]) {
                    if (!restorable.has(file))
                        originals.delete(file);
                }
                registerBuildWriteRestore(originals);
            }
            catch (err) {
                console.warn("[cloudflare-next-intl] autoDynamicPages check error:", err);
            }
        },
    };
}
