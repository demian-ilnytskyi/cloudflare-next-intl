const MAX_FUNCTION_RESOLUTION_ATTEMPTS = 5;
const ANSI_ESCAPE_CODE_PATTERN = /\x1b\[[0-9;]*m/g;
function stripAnsiCodes(value) {
    return value.replace(ANSI_ESCAPE_CODE_PATTERN, '');
}
function resolveFunctionError(value) {
    let result = value;
    try {
        for (let i = 0; i < MAX_FUNCTION_RESOLUTION_ATTEMPTS && typeof result === 'function'; i++) {
            result = result();
        }
        return result;
    }
    catch (error) {
        const message = `Error during function resolution: ${String(error)}`;
        console.warn(message);
        return message;
    }
}
export default function stringifyUnknown(value, isClient, isNested = false) {
    if (value === undefined)
        return 'undefined';
    if (value === null)
        return 'null';
    if (typeof value === 'string')
        return stripAnsiCodes(value);
    if (value instanceof Error)
        return stripAnsiCodes(`${value.name}: ${value.message}\n\n${value.stack ?? ''}`);
    if (typeof value === 'function') {
        const resolved = resolveFunctionError(value);
        return typeof resolved !== 'function' ? stringifyUnknown(resolved, isClient) : '[Function]';
    }
    try {
        return stripAnsiCodes(isNested ? JSON.stringify(value) : JSON.stringify(value, null, 2));
    }
    catch {
        return '[Unserializable value]';
    }
}
