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
export default function stringifyUnknown(value: unknown, isClient?: boolean, isNested?: boolean): string;
