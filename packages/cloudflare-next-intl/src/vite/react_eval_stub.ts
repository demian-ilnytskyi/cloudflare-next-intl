import type { Plugin, UserConfig } from "vite";
import type { PluginBuild } from "esbuild";

export const EVAL_WARNING_RE =
    /console\.error\(\s*["']eval\(\) is not supported in this environment[\s\S]*?React will never use eval\(\) in production mode["']\s*\);?/g;

export const EVAL_POLYFILL_SNIPPET = `
if (typeof globalThis !== "undefined") {
  try {
    (0, eval)("null");
  } catch {
    var _origEval = globalThis.eval;
    globalThis.eval = function (code) {
      if (code === "null") return null;
      if (typeof code === "string") {
        var match = code.match(/\\(\\{\\s*("(?:[^"\\\\\\\\]|\\\\.)*")\\s*:\\s*(?:async\\s+)?(?:function|\\(?\\)?\\s*=>|class)/);
        if (match) {
          try {
            var name = JSON.parse(match[1]);
            var fn = function () {};
            Object.defineProperty(fn, "name", { value: name, configurable: true });
            return { [name]: fn };
          } catch {}
        }
      }
      if (typeof _origEval === "function") {
        try {
          return _origEval.call(this, code);
        } catch {}
      }
      return null;
    };
  }
}
`;

export function transformReactEval(code: string): string {
    if (!code.includes("eval() is not supported in this environment")) {
        return code;
    }
    return EVAL_POLYFILL_SNIPPET + "\n" + code.replace(EVAL_WARNING_RE, "/* silenced react eval warning */");
}

export const reactEvalRolldownPlugin = {
    name: "cfni:react-eval-stub-rolldown",
    transform(code: string) {
        if (code.includes("eval() is not supported in this environment")) {
            return {
                code: transformReactEval(code),
                map: null,
            };
        }
    },
};

export const reactEvalEsbuildPlugin = {
    name: "cfni:react-eval-stub-esbuild",
    setup(build: PluginBuild): void {
        build.onLoad({ filter: /react-server-dom-webpack.*\.js$/ }, async (args) => {
            const fs = await import("node:fs/promises");
            const raw = await fs.readFile(args.path, "utf8");
            if (raw.includes("eval() is not supported in this environment")) {
                return {
                    contents: transformReactEval(raw),
                    loader: "js",
                };
            }
        });
    },
};

export function getReactEvalConfig(): UserConfig {
    const rolldownConfig = {
        rolldownOptions: {
            plugins: [reactEvalRolldownPlugin],
        },
    };

    return {
        optimizeDeps: rolldownConfig,
        ssr: {
            noExternal: ["cloudflare-next-intl", "cloudflare-next-intl-db"],
            optimizeDeps: rolldownConfig,
        },
        environments: {
            rsc: {
                resolve: {
                    noExternal: ["cloudflare-next-intl", "cloudflare-next-intl-db"],
                },
                optimizeDeps: {
                    include: [
                        "cloudflare-next-intl-db",
                        "cloudflare-next-intl-db/schema",
                        "cloudflare-next-intl-db/helpers",
                    ],
                    ...rolldownConfig,
                },
            },
        },
    } as UserConfig;
}

/**
 * In Cloudflare Workers (workerd), V8's code generation from strings (eval) is
 * disallowed by default. React Server Components' edge client bundle in development mode
 * (`react-server-dom-webpack-client.edge.development.js`) calls `(0, eval)("null")`
 * on every module reload to check eval availability for DevTools callstack reconstruction.
 * When this throws, React logs a noisy console.error:
 * "eval() is not supported in this environment. React requires eval() in development mode..."
 *
 * This plugin:
 * 1. Polyfills `globalThis.eval` in the edge/SSR/RSC environment so that:
 *    - `(0, eval)("null")` succeeds without throwing.
 *    - React's dev fake function/class stack-frame wrappers ({ [name]: fn }) are generated
 *      safely via `Object.defineProperty(fn, "name", ...)`.
 * 2. Silences the noisy React dev warning.
 * 3. Applies the transform during both unbundled module transforms and dependency pre-bundling.
 */
export function reactEvalStubPlugin(): Plugin {
    return {
        name: "cfni:react-eval-stub",
        enforce: "pre",
        transform(code) {
            if (code.includes("eval() is not supported in this environment")) {
                return {
                    code: transformReactEval(code),
                    map: null,
                };
            }
        },
        config() {
            return getReactEvalConfig();
        },
    };
}
