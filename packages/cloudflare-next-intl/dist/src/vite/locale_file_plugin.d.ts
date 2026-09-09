import type { Plugin } from "vite";
export interface LocaleFilePluginOptions {
    messagesDir?: string;
    intlConfigPath?: string;
    root?: string;
}
export declare function resolveDefaultIntlConfigPath(root: string): string;
export declare function getCfniDistSrcDir(root: string): string;
export declare function localeFilePlugin(options?: LocaleFilePluginOptions): Plugin;
