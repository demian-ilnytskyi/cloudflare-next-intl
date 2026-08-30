import reportError from './report_error.js';
/**
 * Wraps `fn`, reporting (via `options.config`) then rethrowing any error it
 * throws or rejects with. Never swallows — callers keep their own
 * catch/fallback behavior, this only adds reporting on top.
 */
export default function withErrorHandling(fn, classOrMethodName, options = {}) {
    const { config, params, isClient, consent } = options;
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            await reportError(config, { error, classOrMethodName, params, isClient, consent });
            throw error;
        }
    };
}
