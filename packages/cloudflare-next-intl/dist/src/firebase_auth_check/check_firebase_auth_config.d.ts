export interface FirebaseAuthConfigIssue {
    field: string;
    severity: "error" | "warning";
    reason: string;
    envVar?: string;
    lineNumber?: number;
}
export interface CheckFirebaseAuthConfigOptions {
    intlConfigPath?: string;
    source?: string;
    env?: Record<string, string | undefined>;
    throwOnError?: boolean;
}
export interface CheckFirebaseAuthConfigReport {
    valid: boolean;
    checked: boolean;
    issues: FirebaseAuthConfigIssue[];
    formattedMessage: string;
}
export declare function extractObjectLiteral(source: string, key: string): {
    body: string;
    start: number;
} | null;
export declare function extractFieldValue(body: string, key: string): {
    value: string;
    lineNumber: number;
} | null;
export declare function formatFirebaseAuthConfigMessage(issues: FirebaseAuthConfigIssue[], intlConfigPath?: string): string;
export declare function checkFirebaseAuthConfig(options?: CheckFirebaseAuthConfigOptions): CheckFirebaseAuthConfigReport;
