const MAX_FUNCTION_RESOLUTION_ATTEMPTS = 5;

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_CODE_PATTERN = /\x1b\[[0-9;]*m/g;

/** Strips ANSI color/style escape codes (e.g. from Next.js's own pretty-printed terminal errors) — unreadable once JSON-escaped into a report. */
function stripAnsiCodes(value: string): string {
    return value.replace(ANSI_ESCAPE_CODE_PATTERN, '');
}

function resolveFunctionError(value: unknown): unknown {
    let result = value;
    try {
        for (let i = 0; i < MAX_FUNCTION_RESOLUTION_ATTEMPTS && typeof result === 'function'; i++) {
            result = (result as () => unknown)();
        }
        return result;
    } catch (error) {
        return `Error during function resolution: ${String(error)}`;
    }
}

/**
 * Safely converts an `unknown` value (typically `ErrorHandlingParams.error`)
 * into a string, for logging/dedup-keying/display — never throws.
 *
 * @param isClient Skips resolving function-wrapped/lazy error values on the
 *   client (matches `ErrorHandlingParams.isClient`) — running arbitrary
 *   caught functions client-side isn't safe the way it is on the server.
 * @param isNested Set when stringifying a value nested inside another
 *   object/array — falls back to a plain `JSON.stringify` (no pretty-print)
 *   so a single unserializable nested value can't crash the whole report.
 */
export default function stringifyUnknown(value: unknown, isClient?: boolean, isNested = false): string {
    if (typeof value === 'string') return stripAnsiCodes(value);
    if (value instanceof Error) return stripAnsiCodes(`${value.name}: ${value.message}\n\n${value.stack ?? ''}`);

    if (typeof value === 'function') {
        if (isClient) return '[Function]';
        const resolved = resolveFunctionError(value);
        return typeof resolved !== 'function' ? stringifyUnknown(resolved, isClient) : '[Function]';
    }

    try {
        return stripAnsiCodes(isNested ? JSON.stringify(value) : JSON.stringify(value, null, 2));
    } catch {
        return '[Unserializable value]';
    }
}
