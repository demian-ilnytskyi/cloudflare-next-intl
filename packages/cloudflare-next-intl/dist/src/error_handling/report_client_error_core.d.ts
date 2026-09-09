import type { ErrorHandlingParams } from '../types/types.js';
import { type ReportErrorConfig } from './report_error.js';
export declare function reportClientErrorCore(config: ReportErrorConfig | undefined, error: unknown, classOrMethodName: string, params?: ErrorHandlingParams['params']): Promise<void>;
