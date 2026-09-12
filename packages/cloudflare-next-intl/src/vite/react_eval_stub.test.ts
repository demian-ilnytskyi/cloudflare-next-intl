import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reactEvalEsbuildPlugin, reactEvalRolldownPlugin, reactEvalStubPlugin, transformReactEval } from "./react_eval_stub.js";
import type { PluginBuild, OnLoadResult } from "esbuild";

describe("reactEvalStubPlugin", () => {
    it("transforms code containing eval warning by prepending polyfill and silencing warning", () => {
        const originalCode = `
        function checkEvalAvailabilityOnceDev() {
          if (!hasConfirmedEval) {
            hasConfirmedEval = !0;
            try {
              (0, eval)("null");
            } catch ($jscomp$unused$catch) {
              console.error(
                "eval() is not supported in this environment. React requires eval() in development mode for various debugging features like reconstructing callstacks from a different environment.\\nReact will never use eval() in production mode"
              );
            }
          }
        }
        `;

        const transformed = transformReactEval(originalCode);
        expect(transformed).toContain("globalThis.eval = function (code)");
        expect(transformed).toContain("/* silenced react eval warning */");
        expect(transformed).not.toContain("eval() is not supported in this environment");
    });

    it("leaves code untouched if eval warning string is not present", () => {
        const code = `const a = 1; export default a;`;
        expect(transformReactEval(code)).toBe(code);
    });

    it("provides config hook with rolldownOptions and ssr.noExternal", () => {
        const plugin = reactEvalStubPlugin();
        const configFn = plugin.config as (...args: unknown[]) => unknown;
        const config = configFn() as {
            optimizeDeps?: { rolldownOptions?: { plugins?: unknown[] }; esbuildOptions?: unknown };
            ssr?: { noExternal?: string[] };
            environments?: {
                rsc?: {
                    resolve?: { noExternal?: string[] };
                    optimizeDeps?: { include?: string[]; rolldownOptions?: { plugins?: unknown[] } };
                };
            };
        };
        expect(config.optimizeDeps?.include).toContain("next/web-vitals");
        expect(config.optimizeDeps?.rolldownOptions?.plugins).toHaveLength(1);
        expect(config.optimizeDeps?.esbuildOptions).toBeUndefined();
        expect(config.ssr?.noExternal).toContain("cloudflare-next-intl");
        expect(config.ssr?.noExternal).toContain("cloudflare-next-intl-db");
        expect(config.environments?.rsc?.resolve?.noExternal).toContain("cloudflare-next-intl-db");
        expect(config.environments?.rsc?.optimizeDeps?.include).toContain("cloudflare-next-intl-db");
    });

    it("rolldown plugin transforms code containing eval warning", () => {
        const code = `console.error("eval() is not supported in this environment. React requires eval() in development mode... React will never use eval() in production mode");`;
        const result = reactEvalRolldownPlugin.transform(code);
        expect(result).toBeDefined();
        expect(result!.code).toContain("globalThis.eval = function (code)");

        expect(reactEvalRolldownPlugin.transform(`console.log("hello");`)).toBeUndefined();
    });

    it("plugin transform hook transforms code containing eval warning", () => {
        const plugin = reactEvalStubPlugin();
        const transform = plugin.transform as (...args: unknown[]) => { code: string } | undefined;

        const codeWithWarning = `console.error("eval() is not supported in this environment. React requires eval() in development mode... React will never use eval() in production mode");`;
        const result = transform(codeWithWarning, "some-file.js");
        expect(result).toBeDefined();
        expect(result!.code).toContain("globalThis.eval = function (code)");

        const codeWithout = `console.log("hello");`;
        expect(transform(codeWithout, "some-file.js")).toBeUndefined();
    });

    type OnLoadCallback = (args: { path: string }) => Promise<OnLoadResult | undefined>;

    function captureOnLoad(): { getCallback: () => OnLoadCallback } {
        let captured: OnLoadCallback | undefined;
        const build = {
            onLoad: (_opts: unknown, cb: OnLoadCallback) => {
                captured = cb;
            },
        } as unknown as PluginBuild;
        reactEvalEsbuildPlugin.setup(build);
        return {
            getCallback: () => captured!,
        };
    }

    it("esbuild onLoad transforms file contents containing eval warning", async () => {
        const dir = await mkdtemp(join(tmpdir(), "react-eval-stub-"));
        const filePath = join(dir, "react-server-dom-webpack-client.edge.development.js");
        await writeFile(
            filePath,
            `console.error("eval() is not supported in this environment. React will never use eval() in production mode");`,
            "utf8",
        );

        const result = await captureOnLoad().getCallback()({ path: filePath });
        expect(result!.loader).toBe("js");
        expect(result!.contents).toContain("globalThis.eval = function (code)");

        await rm(dir, { recursive: true, force: true });
    });

    it("esbuild onLoad leaves file untouched when it has no eval warning", async () => {
        const dir = await mkdtemp(join(tmpdir(), "react-eval-stub-"));
        const filePath = join(dir, "react-server-dom-webpack-client.edge.development.js");
        await writeFile(filePath, `console.log("hello");`, "utf8");

        const result = await captureOnLoad().getCallback()({ path: filePath });
        expect(result).toBeUndefined();

        await rm(dir, { recursive: true, force: true });
    });
});
