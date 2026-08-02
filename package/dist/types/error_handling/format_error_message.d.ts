import type { ErrorHandlingParams } from '../types/types';
/**
 * Builds a human-readable one-string summary of an `ErrorHandlingParams` —
 * `[classOrMethodName] Error: <message>` followed by non-empty `Params`/
 * `IsClient` sections. Never throws (`stringifyUnknown` is safe). Used as
 * `ErrorHandlingParams.formattedMessage` — read this instead of `error`/
 * `params` directly when you just want something printable.
 */
export default function formatErrorMessage(params: ErrorHandlingParams): string;
