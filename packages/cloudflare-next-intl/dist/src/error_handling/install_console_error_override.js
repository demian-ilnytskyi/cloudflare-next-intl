import reportError, { consoleOverrideState } from './report_error.js';
export const EMPTY_CONSOLE_ERROR_MESSAGE = 'console.error called with no message';
function callerStack() {
    const stack = new Error().stack;
    if (!stack)
        return '';
    return `\n${stack.split('\n').slice(3).join('\n')}`;
}
export default function installConsoleErrorOverride(config, isClient) {
    if (config?.errorHandling?.overrideConsoleError !== true)
        return;
    if (console.error.__isErrorHandlingOverride)
        return;
    const originalConsoleError = console.error.bind(console);
    consoleOverrideState.active = true;
    const suppressOnClient = isClient === true && config.errorHandling?.suppressClientConsoleError === true;
    const override = (message, ...optionalParams) => {
        const isEmptyCall = message === undefined && optionalParams.length === 0;
        const stack = isEmptyCall ? callerStack() : '';
        if (!suppressOnClient) {
            if (isEmptyCall) {
                originalConsoleError(`${EMPTY_CONSOLE_ERROR_MESSAGE}${stack}`);
            }
            else {
                originalConsoleError(message, ...optionalParams);
            }
        }
        void reportError(config, {
            error: message,
            classOrMethodName: 'Global Console Error Handler',
            params: isEmptyCall ? [`${EMPTY_CONSOLE_ERROR_MESSAGE}${stack}`] : optionalParams,
            isClient,
        });
    };
    override.__isErrorHandlingOverride = true;
    console.error = override;
}
