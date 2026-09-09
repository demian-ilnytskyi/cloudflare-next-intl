import type { Plugin } from "vite";
import { type DynamicApiCheck, type DynamicPagesCheckMode, type PageLabelStyle } from "../dynamic_pages_check/index.js";
export interface AutoDynamicPagesPluginOptions {
    appDir?: string;
    mode?: DynamicPagesCheckMode;
    target?: 'next' | 'vinext';
    includeLoading?: boolean;
    verifyVinextRouteWiring?: boolean;
    syncErrorReportingAuthUser?: boolean;
    extraChecks?: readonly DynamicApiCheck[];
    verbose?: boolean | {
        pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string);
    };
    restoreAfterBuild?: boolean;
}
export declare function autoDynamicPagesPlugin(options?: AutoDynamicPagesPluginOptions): Plugin;
