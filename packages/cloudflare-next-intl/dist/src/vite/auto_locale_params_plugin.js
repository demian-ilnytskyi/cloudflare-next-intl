import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkLocaleParams } from "../locale_params_check/check_locale_params.js";
import { registerBuildWriteRestore } from "./build_write_restore_stack.js";
const RESTORABLE_ACTIONS = new Set(['added-locale-params']);
export function autoLocaleParamsPlugin(options = {}) {
    let ran = false;
    return {
        name: "cloudflare-next-intl-auto-locale-params",
        enforce: "pre",
        async configResolved(config) {
            if (ran)
                return;
            const isBuild = config.command === "build";
            const isDev = config.command === "serve";
            if (!isBuild && !(isDev && options.runOnDev))
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
            if (!appDir || !existsSync(appDir))
                return;
            const restoreAfterBuild = isBuild && (options.restoreAfterBuild ?? true);
            const originals = new Map();
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
                    .filter((report) => RESTORABLE_ACTIONS.has(report.action))
                    .map((report) => report.file));
                for (const file of [...originals.keys()]) {
                    if (!restorable.has(file))
                        originals.delete(file);
                }
                registerBuildWriteRestore(originals);
            }
            catch (err) {
                console.warn("[cloudflare-next-intl] autoLocaleParams check error:", err);
            }
        },
    };
}
