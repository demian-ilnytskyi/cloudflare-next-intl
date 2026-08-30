import reportError from './report_error.js';
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
