export interface AliasConfig {
    prefix: string;
    replacement: string;
}
export declare function extractImportSpecifiers(sourceText: string): string[];
export interface ImportBindingInfo {
    specifier: string;
    bindings: string[];
    alwaysFollow: boolean;
    start: number;
    end: number;
}
export declare function extractImportBindings(sourceText: string): ImportBindingInfo[];
export declare function resolveLocalImport(specifier: string, fromFile: string, aliases: readonly AliasConfig[], isFile?: (file: string) => boolean): string | null;
