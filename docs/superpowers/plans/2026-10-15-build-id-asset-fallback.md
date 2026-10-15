# buildIdAsset Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `buildIdAsset()` always emits `BUILD_ID` into client output for app-only vinext builds, never silent no-op.

**Architecture:** Replace client `generateBundle` with `buildApp: { order: "post", handler }`. After all environments build: resolve id from `process.env.__VINEXT_SHARED_BUILD_ID ?? process.env.__VINEXT_BUILD_ID`, else read `<root>/dist/server/BUILD_ID` (vinext 1.0.1 always writes it). Write to `builder.environments.client.config.build.outDir/<fileName>`. Nothing found → generate `String(Date.now())` and `logger.warn` that a generated id is used.

**Tech Stack:** Vite 6+ Environment API (`buildApp` plugin hook), vitest, node:fs.

**Spec:** user bug report (this conversation) — app-only builds get 404 on `HEAD /BUILD_ID` from `IntlHelperScript`.

## Global Constraints

- Public API unchanged: `buildIdAsset(fileName = "BUILD_ID"): Plugin`, name `cfni:build-id-asset`, `apply: "build"`.
- Env vars stay first source; server file is fallback.
- No silent no-op: if id missing, generate `String(Date.now())` + warn.
- Trim file contents; skip empty.

## Review Focus

- Server outDir customised (not `dist/server`) → use `builder.environments.rsc ?? ssr` `config.build.outDir` first, then `<root>/dist/server`.
- No client environment (pure SSR build) → return without warn/write.
- BUILD_ID file has trailing newline → trimmed.
- Client outDir relative → resolve against `builder.config.root`.
- Hook runs in dev → `apply: "build"` keeps it off.

---

### Task 1: buildApp-based emission

**Files:**
- Modify: `packages/cloudflare-next-intl/src/vite/build_id_asset.ts`
- Test: `packages/cloudflare-next-intl/src/vite/build_id_asset.test.ts` (rewrite generateBundle tests)

**Interfaces:**
- Produces: plugin with `buildApp: { order: "post", handler(builder) }`; no `generateBundle`.

- [x] **Step 1: Write failing tests** — use tmp dir (`fs.mkdtempSync(os.tmpdir())`), fake builder:

```ts
const builder = (root: string, envs: Record<string, string>) => ({
  config: { root, logger: { warn: vi.fn() } },
  environments: Object.fromEntries(Object.entries(envs).map(([k, outDir]) => [k, { config: { build: { outDir } } }])),
});
```

Cases:
1. env `__VINEXT_SHARED_BUILD_ID=shared-1` → `<client>/BUILD_ID` === `shared-1`.
2. no env, `<root>/dist/server/BUILD_ID` = `abc\n` → client file `abc`.
3. `rsc` outDir `out/rsc` containing `BUILD_ID` → used over `dist/server`.
4. nothing found → file contains `Date.now()` value (vi.spyOn(Date, "now").mockReturnValue(1700000000000) → "1700000000000"), `logger.warn` called once.
5. no `client` env → no write, no warn.
6. custom `fileName` `"version.txt"`.
7. relative client outDir `dist/client` resolved against root.

- [x] **Step 2: Run** `rtk npx vitest run src/vite/build_id_asset.test.ts` (timeout 60s) → FAIL.

- [x] **Step 3: Implement**

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function buildIdAsset(fileName = "BUILD_ID"): Plugin {
  return {
    name: "cfni:build-id-asset",
    apply: "build",
    buildApp: {
      order: "post",
      handler(builder) {
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
```

- [x] **Step 4: Run tests** → PASS. Also `rtk npx tsc --noEmit -p .`.

- [x] **Step 5: Verify real build** — in `/Volumes/External/own_projects/inflalite` link local package, `vinext build`, confirm `dist/client/BUILD_ID` equals `dist/server/BUILD_ID`.

- [ ] **Step 6: Commit** — `fix: emit BUILD_ID asset for app-only vinext builds via buildApp fallback`.

### Task 2: Docs + release

**Files:** `packages/cloudflare-next-intl/README.md`, `CHANGELOG.md`

- [x] Update README: id sources order (env → server `BUILD_ID` file), warning on miss.
- [x] CHANGELOG patch entry; bump version.
- [ ] Commit `docs: describe BUILD_ID fallback`.

### Task 3 (consumer, after release)

- [ ] Bump package in `crv/package.json`, `crv/marketing/package.json`.
- [ ] Remove local `serveBuildIdAsset` plugin and `buildIdAsset: false` from `marketing/vite.config.ts`.
- [ ] Build both, `HEAD /BUILD_ID` → 200.
