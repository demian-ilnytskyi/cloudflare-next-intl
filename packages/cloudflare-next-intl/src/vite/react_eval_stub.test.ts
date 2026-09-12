import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reactEvalEsbuildPlugin, reactEvalStubPlugin, transformReactEval } from "./react_eval_stub.js";

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

    it("provides config hook with optimizeDeps exclude and esbuildOptions", () => {
        const plugin = reactEvalStubPlugin();
        const configFn = plugin.config as Function;
        const config = configFn();

        expect(config.optimizeDeps.exclude).toContain("react-server-dom-webpack");
        expect(config.optimizeDeps.exclude).toContain("react-server-dom-webpack/client.edge");
        expect(config.optimizeDeps.esbuildOptions.plugins).toHaveLength(1);
        expect(config.ssr.optimizeDeps.esbuildOptions.plugins).toHaveLength(1);
        expect(config.environments.rsc.optimizeDeps.esbuildOptions.plugins).toHaveLength(1);
    });

    it("plugin transform hook transforms code containing eval warning", () => {
        const plugin = reactEvalStubPlugin();
        const transform = plugin.transform as Function;

        const codeWithWarning = `console.error("eval() is not supported in this environment. React requires eval() in development mode... React will never use eval() in production mode");`;
        const result = transform(codeWithWarning, "some-file.js");
        expect(result).toBeDefined();
        expect(result.code).toContain("globalThis.eval = function (code)");

        const codeWithout = `console.log("hello");`;
        expect(transform(codeWithout, "some-file.js")).toBeUndefined();
    });

    it("esbuild onLoad transforms file contents containing eval warning", async () => {
        const dir = await mkdtemp(join(tmpdir(), "react-eval-stub-"));
        const filePath = join(dir, "react-server-dom-webpack-client.edge.development.js");
        await writeFile(
            filePath,
            `console.error("eval() is not supported in this environment. React will never use eval() in production mode");`,
            "utf8",
        );

        let onLoadCallback: Function | undefined;
        reactEvalEsbuildPlugin.setup({
            onLoad: (_opts: unknown, cb: Function) => {
                onLoadCallback = cb;
            },
        });

        const result = await onLoadCallback!({ path: filePath });
        expect(result.loader).toBe("js");
        expect(result.contents).toContain("globalThis.eval = function (code)");

        await rm(dir, { recursive: true, force: true });
    });

    it("esbuild onLoad leaves file untouched when it has no eval warning", async () => {
        const dir = await mkdtemp(join(tmpdir(), "react-eval-stub-"));
        const filePath = join(dir, "react-server-dom-webpack-client.edge.development.js");
        await writeFile(filePath, `console.log("hello");`, "utf8");

        let onLoadCallback: Function | undefined;
        reactEvalEsbuildPlugin.setup({
            onLoad: (_opts: unknown, cb: Function) => {
                onLoadCallback = cb;
            },
        });

        const result = await onLoadCallback!({ path: filePath });
        expect(result).toBeUndefined();

        await rm(dir, { recursive: true, force: true });
    });
});
