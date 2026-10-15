import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function buildIdAsset(fileName = "BUILD_ID"): Plugin {
  return {
    name: "cfni:build-id-asset",
    apply: "build",
    buildApp: {
      order: "post",
      async handler(builder) {
        const client = builder.environments.client;
        if (!client) return;
        const root = builder.config.root;
        const serverDirs = [builder.environments.rsc, builder.environments.ssr]
          .map((e) => e?.config.build.outDir)
          .filter((d): d is string => !!d)
          .concat("dist/server")
          .map((d) => resolve(root, d, "BUILD_ID"));
        const fromFile = serverDirs.filter(existsSync).map((p) => readFileSync(p, "utf8").trim()).find(Boolean);
        let buildId = process.env.__VINEXT_SHARED_BUILD_ID ?? process.env.__VINEXT_BUILD_ID ?? fromFile;
        if (!buildId) {
          buildId = String(Date.now());
          builder.config.logger.warn(`[cfni:build-id-asset] build id not found; using generated ${buildId}`);
        }
        const outDir = resolve(root, client.config.build.outDir);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, fileName), buildId);
      },
    },
  };
}
