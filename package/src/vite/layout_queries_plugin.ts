import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkLayoutQueries, type CheckLayoutQueriesOptions } from "../layout_queries_check/index.js";

export interface LayoutQueriesPluginOptions extends CheckLayoutQueriesOptions {
  /**
   * Whether to fail the build if layout DB violations are found.
   * Defaults to `false` (prints visible terminal warning with instructions).
   * Set `true` to throw an error and abort the build.
   * @default false
   */
  strict?: boolean;

  /**
   * Run the check on `vite dev` too, in addition to `vite build`.
   * Defaults to `true` so violations are caught immediately during development.
   * @default true
   */
  runOnDev?: boolean;
}

export function layoutQueriesPlugin(options: LayoutQueriesPluginOptions = {}): Plugin {
  let ran = false;

  return {
    name: "cloudflare-next-intl-layout-queries-check",
    enforce: "pre",
    configResolved(config) {
      if (ran) return;
      const isBuild = config.command === "build";
      const isDev = config.command === "serve";

      const runOnDev = options.runOnDev ?? true;
      if (!isBuild && !(isDev && runOnDev)) return;

      const root = config.root || process.cwd();
      const candidateAppDirs = [
        options.appDir,
        resolve(root, "src/app"),
        resolve(root, "app"),
      ].filter((dir): dir is string => !!dir && existsSync(dir));

      const appDir = candidateAppDirs[0];
      if (!appDir) return;

      ran = true;

      const report = checkLayoutQueries({
        appDir,
        rootDir: root,
        aliases: options.aliases,
        maxDepth: options.maxDepth,
        throwOnError: false,
      });

      if (!report.valid) {
        // Output very clear and visible warning in console
        console.warn(report.formattedMessage);

        if (options.strict) {
          throw new Error(
            "[cloudflare-next-intl] Build failed: Blocking database queries detected in layout tree. See details above."
          );
        }
      }
    },
  };
}
