import type { ConsentValue } from '../cookie_consent/types';
import reportError, { type ReportErrorConfig } from './report_error';

export interface WithErrorHandlingOptions {
    /** Pass the relevant slices of your `RoutingConfig` directly — `{ errorHandling: config.errorHandling, generate: config.generate }`. */
    config?: ReportErrorConfig;
    params?: unknown;
    isClient?: boolean;
    consent?: ConsentValue;
}

/**
 * Wraps `fn`, reporting (via `options.config`) then rethrowing any error it
 * throws or rejects with. Never swallows — callers keep their own
 * catch/fallback behavior, this only adds reporting on top.
 */
export default function withErrorHandling<Args extends unknown[], Result>(
    fn: (...args: Args) => Result | Promise<Result>,
    classOrMethodName: string,
    options: WithErrorHandlingOptions = {},
): (...args: Args) => Promise<Result> {
    const { config, params, isClient, consent } = options;
    return async (...args: Args): Promise<Result> => {
        try {
            return await fn(...args);
        } catch (error) {
            await reportError(config, { error, classOrMethodName, params, isClient, consent });
            throw error;
        }
    };
}
