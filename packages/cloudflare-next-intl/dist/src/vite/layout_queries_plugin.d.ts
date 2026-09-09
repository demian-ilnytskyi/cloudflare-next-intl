import type { Plugin } from "vite";
import { type CheckLayoutQueriesOptions } from "../layout_queries_check/index.js";
export interface LayoutQueriesPluginOptions extends CheckLayoutQueriesOptions {
    strict?: boolean;
    runOnDev?: boolean;
}
export declare function layoutQueriesPlugin(options?: LayoutQueriesPluginOptions): Plugin;
