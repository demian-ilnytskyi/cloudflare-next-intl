export interface DynamicApiMatch {
    name: string;
    line: number;
}
export interface DynamicDetectionResult {
    hasExplicitDynamicExport: boolean;
    detectedDynamicApis: string[];
    matches: DynamicApiMatch[];
}
export declare function stripComments(sourceText: string): string;
export interface DynamicApiCheck {
    name: string;
    pattern: RegExp;
}
export declare const USE_CLIENT_DIRECTIVE: RegExp;
export declare function detectDynamicUsage(sourceText: string, extraChecks?: readonly DynamicApiCheck[]): DynamicDetectionResult;
export declare function readExplicitDynamicValue(sourceText: string): 'force-static' | 'force-dynamic' | 'auto' | 'error' | null;
