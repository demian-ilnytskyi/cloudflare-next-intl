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
export default function stringifyUnknown(value: unknown, isClient?: boolean, isNested?: boolean): string;
