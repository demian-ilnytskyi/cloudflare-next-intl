import type { Plugin } from "vite";

export function buildIdAsset(fileName = "BUILD_ID"): Plugin {
  return {
    name: "cfni:build-id-asset",
    apply: "build",
    generateBundle() {
      if (this.environment?.name !== "client") return;
      const buildId = process.env.__VINEXT_SHARED_BUILD_ID ?? process.env.__VINEXT_BUILD_ID;
      if (!buildId) return;
      this.emitFile({ type: "asset", fileName, source: buildId });
    },
  };
}
