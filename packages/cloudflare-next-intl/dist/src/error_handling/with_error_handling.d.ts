import type { ConsentValue } from '../cookie_consent/types.js';
import { type ReportErrorConfig } from './report_error.js';
export interface WithErrorHandlingOptions {
    config?: ReportErrorConfig;
    params?: unknown;
    isClient?: boolean;
    consent?: ConsentValue;
}
export default function withErrorHandling<Args extends unknown[], Result>(fn: (...args: Args) => Result | Promise<Result>, classOrMethodName: string, options?: WithErrorHandlingOptions): (...args: Args) => Promise<Result>;
