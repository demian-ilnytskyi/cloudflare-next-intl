export interface LayoutDbViolation {
    layoutFile: string;
    sourceFile: string;
    lineNumber: number;
    lineContent: string;
    signal: string;
    importTrace: string[];
}
export interface CheckLayoutQueriesOptions {
    appDir?: string;
    rootDir?: string;
    aliases?: Record<string, string>;
    maxDepth?: number;
    throwOnError?: boolean;
}
export interface CheckLayoutQueriesReport {
    valid: boolean;
    violations: LayoutDbViolation[];
    formattedMessage: string;
}
export declare function findLayoutFiles(dir: string): string[];
export declare function formatLayoutDbViolationMessage(violations: LayoutDbViolation[]): string;
export declare function checkLayoutQueries(options?: CheckLayoutQueriesOptions): CheckLayoutQueriesReport;
