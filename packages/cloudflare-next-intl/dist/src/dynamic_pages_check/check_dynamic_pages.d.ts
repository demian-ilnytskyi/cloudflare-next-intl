import { type DynamicApiCheck } from './detect_dynamic_usage.js';
import { type DynamicSignal } from './trace_dynamic_usage.js';
import { type SyncErrorReportingAuthUserReport } from './sync_error_reporting_auth_user.js';
import { type PageLabelStyle } from './derive_page_label.js';
import type { AliasConfig } from './resolve_local_imports.js';
export type DynamicPagesCheckMode = 'off' | 'report' | 'fix';
export interface CheckDynamicPagesOptions {
    appDir: string;
    mode?: DynamicPagesCheckMode;
    target?: 'next' | 'vinext';
    skip?: readonly string[];
    includeLoading?: boolean;
    verifyVinextRouteWiring?: boolean;
    projectRoot?: string;
    resolveImports?: boolean;
    aliases?: readonly AliasConfig[];
    extraChecks?: readonly DynamicApiCheck[];
    syncErrorReportingAuthUser?: boolean;
    verbose?: boolean | {
        pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string);
    };
}
export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-dynamic' | 'would-add-force-dynamic' | 'added-force-static' | 'would-add-force-static' | 'already-declared' | 'no-dynamic-usage-detected' | 'skipped';
    signals?: DynamicSignal[];
    explicitValue?: 'force-static' | 'force-dynamic' | 'auto' | 'error' | null;
}
export interface CheckDynamicPagesIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
    isFile?: (file: string) => boolean;
    isVinextRouteWiringSafe?: (root: string) => boolean;
}
export declare function checkDynamicPages(options: CheckDynamicPagesOptions, io?: CheckDynamicPagesIo): Promise<(CheckDynamicPagesReport | SyncErrorReportingAuthUserReport)[]>;
