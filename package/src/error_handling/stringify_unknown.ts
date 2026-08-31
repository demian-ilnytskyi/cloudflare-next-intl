const MAX_FUNCTION_RESOLUTION_ATTEMPTS = 5;

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_CODE_PATTERN = /\x1b\[[0-9;]*m/g;

/** Strips ANSI color/style escape codes (e.g. from Next.js's own pretty-printed terminal errors) — unreadable once JSON-escaped into a report. */
function stripAnsiCodes(value: string): string {
    return value.replace(ANSI_ESCAPE_CODE_PATTERN, '');
}

/**
 * True for a function React itself tags as a special internal reference —
 * an element, a server/client/temporary reference, etc. (all carry a
 * `$$typeof` symbol, the same marker `React.isValidElement` checks). A React
 * Server Components pipeline can hand one of these to client code in place
 * of a value that failed to cross the server/client boundary intact (e.g. an
 * error thrown mid-render that couldn't be reconstructed on the other side).
 * Unlike a genuine lazy-error-thunk (`() => new Error(...)`), calling one of
 * these is guaranteed to throw by design — it exists to be rendered or
 * passed through, never invoked — so `resolveFunctionError` must never call
 * it, or every such report degenerates into this call's own internal
 * "temporary/client reference" error instead of anything about the original
 * failure.
 */
function isReactInternalReference(value: unknown): boolean {
    return typeof value === 'function' && '$$typeof' in value;
}

function resolveFunctionError(value: unknown): unknown {
    if (isReactInternalReference(value)) {
        return '[React internal reference could not be resolved to a value]';
    }
    let result = value;
    try {
        for (let i = 0; i < MAX_FUNCTION_RESOLUTION_ATTEMPTS && typeof result === 'function'; i++) {
            if (isReactInternalReference(result)) {
                return '[React internal reference could not be resolved to a value]';
            }
            result = (result as () => unknown)();
        }
        return result;
    } catch (error) {
        const message = `Error during function resolution: ${String(error)}`;
        console.warn(message);
        return message;
    }
}

/**
 * Safely converts an `unknown` value (typically `ErrorHandlingParams.error`)
 * into a string, for logging/dedup-keying/display — never throws.
 *
 * @param isClient Matches `ErrorHandlingParams.isClient`; forwarded to nested
 *   `stringifyUnknown` calls when resolving a function-wrapped error.
 * @param isNested Set when stringifying a value nested inside another
 *   object/array — falls back to a plain `JSON.stringify` (no pretty-print)
 *   so a single unserializable nested value can't crash the whole report.
 */
export default function stringifyUnknown(value: unknown, isClient?: boolean, isNested = false): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return stripAnsiCodes(value);
    if (value instanceof Error) return stripAnsiCodes(`${value.name}: ${value.message}\n\n${value.stack ?? ''}`);

    if (typeof value === 'function') {
        const resolved = resolveFunctionError(value);
        return typeof resolved !== 'function' ? stringifyUnknown(resolved, isClient) : '[Function]';
    }

    try {
        return stripAnsiCodes(isNested ? JSON.stringify(value) : JSON.stringify(value, null, 2));
    } catch {
        return '[Unserializable value]';
    }
}
