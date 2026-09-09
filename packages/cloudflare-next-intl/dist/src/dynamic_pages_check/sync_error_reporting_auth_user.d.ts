import type { AliasConfig } from './resolve_local_imports.js';
import type { DynamicPagesCheckMode } from './check_dynamic_pages.js';
export interface SyncErrorReportingAuthUserOptions {
    appDir: string;
    mode?: DynamicPagesCheckMode;
    target?: 'next' | 'vinext';
    skip?: readonly string[];
    aliases?: readonly AliasConfig[];
}
export interface SyncErrorReportingAuthUserReport {
    file: string;
    action: 'added-use-auth-user' | 'would-add-use-auth-user';
    callCount: number;
}
export interface SyncErrorReportingAuthUserIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
    isFile?: (file: string) => boolean;
}
export declare function syncErrorReportingAuthUser(options: SyncErrorReportingAuthUserOptions, io?: SyncErrorReportingAuthUserIo): Promise<SyncErrorReportingAuthUserReport[]>;
