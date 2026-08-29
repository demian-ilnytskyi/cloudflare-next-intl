import type { Plugin } from "vite";
export interface LocaleFilePluginOptions {
    /**
     * Directory containing translation json files (e.g. `./messages`).
     * @default "./messages"
     */
    messagesDir?: string;
    /**
     * Path to `intl_config.ts`.
     */
    intlConfigPath?: string;
    /**
     * Root directory of the project. Defaults to `process.cwd()`.
     */
    root?: string;
}
export declare function resolveDefaultIntlConfigPath(root: string): string;
export declare function getCfniDistSrcDir(root: string): string;
export declare function localeFilePlugin(options?: LocaleFilePluginOptions): Plugin;
