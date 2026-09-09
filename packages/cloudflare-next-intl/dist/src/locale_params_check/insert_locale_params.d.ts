export declare function insertLocaleParamsSignature(sourceText: string, localeParam: string): string;
export declare function wrapSyncDefaultExportWithParams(sourceText: string, localeParam: string, existingParamsType?: string): string;
export declare function addParamsPropToExistingDestructure(sourceText: string, localeParam: string): string;
export declare function insertLocaleParamsBody(sourceText: string, localeParam: string, hasInlineDestructure: boolean): string;
export declare function extractParamsPromiseType(sourceText: string): string | null;
export declare function ensureLocaleInParamsType(sourceText: string, localeParam: string): string;
export declare function ensureSetLocaleImport(sourceText: string): string;
