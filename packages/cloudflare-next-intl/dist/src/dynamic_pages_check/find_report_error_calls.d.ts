export interface ReportErrorCall {
    insertPos: number | null;
    hasExplicitUseAuthUser: boolean;
}
export declare function findReportErrorCalls(sourceText: string): ReportErrorCall[];
