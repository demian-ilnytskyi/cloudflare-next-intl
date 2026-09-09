import type { Plugin } from "vite";
export interface LucideOptimizerPluginOptions {
    root?: string;
    normalizeNextJsImports?: boolean;
    lucideEntryPath?: string;
}
export declare const JS_EXT_RE: RegExp;
export declare const LUCIDE_IMPORT_RE: RegExp;
export declare const NEXT_JS_IMPORT_RE: RegExp;
export declare function detectLucideReact(root: string): boolean;
export declare function resolveLucideEsmEntry(root: string): string | null;
export declare function parseLucideIconMap(esmEntryPath: string): Map<string, string>;
export declare function transformLucideImports(code: string, iconMap: Map<string, string>): {
    code: string;
    changed: boolean;
};
export declare function transformNextJsImports(code: string): {
    code: string;
    changed: boolean;
};
export declare function lucideOptimizerPlugin(options?: LucideOptimizerPluginOptions): Plugin;
