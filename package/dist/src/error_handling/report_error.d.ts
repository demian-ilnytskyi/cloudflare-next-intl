import type { ErrorHandlingParams, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
export interface ReportErrorConfig {
    errorHandling?: ErrorHandlingRoutingConfig;
    generate?: GenerateRoutingConfig;
}
export declare const consoleOverrideState: {
    active: boolean;
};
export default function reportError(config: ReportErrorConfig | undefined, params: ErrorHandlingParams): Promise<void>;
