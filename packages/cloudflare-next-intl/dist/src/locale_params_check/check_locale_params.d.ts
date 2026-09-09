import { type PageLabelStyle } from '../dynamic_pages_check/derive_page_label.js';
export type LocaleParamsCheckMode = 'off' | 'report' | 'fix';
export interface CheckLocaleParamsOptions {
    appDir: string;
    mode?: LocaleParamsCheckMode;
    localeParam?: string;
    skip?: readonly string[];
    overrides?: Readonly<Record<string, {
        localeParam?: string;
    }>>;
    verbose?: boolean | {
        pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string);
    };
}
export interface CheckLocaleParamsReport {
    file: string;
    action: 'added-locale-params' | 'would-add-locale-params' | 'already-set-up' | 'needs-manual-edit' | 'skipped';
}
export interface CheckLocaleParamsIo {
    findLocaleScopedFiles?: (appDir: string, localeParam: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
}
export declare function checkLocaleParams(options: CheckLocaleParamsOptions, io?: CheckLocaleParamsIo): Promise<CheckLocaleParamsReport[]>;
