import type { ErrorHandlingParams } from '../types/types';
import stringifyUnknown from './stringify_unknown';

function formatSection(title: string, value: unknown, isClient?: boolean): string {
    if (value === undefined) return '';
    const text = stringifyUnknown(value, isClient, true);
    if (!text || text === '{}' || text === '[]') return '';
    return `\n${title}: ${text}`;
}

/**
 * Builds a human-readable one-string summary of an `ErrorHandlingParams` —
 * `[classOrMethodName] Error: <message>` followed by non-empty `Params`/
 * `IsClient` sections. Never throws (`stringifyUnknown` is safe). Used as
 * `ErrorHandlingParams.formattedMessage` — read this instead of `error`/
 * `params` directly when you just want something printable.
 */
export default function formatErrorMessage(params: ErrorHandlingParams): string {
    const { error, classOrMethodName, params: extraParams, isClient } = params;
    const errorText = stringifyUnknown(error, isClient);
    const paramsSection = formatSection('Params', extraParams, isClient);
    const clientSection = isClient ? '\nSource: client' : '';

    return `[${classOrMethodName}] Error: ${errorText}${paramsSection}${clientSection}`;
}
