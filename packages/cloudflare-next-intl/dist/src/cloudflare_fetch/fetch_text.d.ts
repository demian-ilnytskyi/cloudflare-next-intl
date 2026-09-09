import { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';
export declare function fetchText(input: RequestInfo | URL, init: RequestInit, config: (ReportErrorConfig & {
    generate?: GenerateRoutingConfig;
}) | undefined, reportAs: string): Promise<string | null>;
