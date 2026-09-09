import type { ErrorHandlingParams } from '../types/types.js';
import stringifyUnknown from './stringify_unknown.js';
import mergeReportParams from './merge_report_params.js';
import reportClientErrorAction from './report_client_error_action.js';

/**
 * The `digest` and `cause` a caught error carries, as plain strings, read
 * while the error is still a live object.
 *
 * BOTH DIE AT THE ACTION BOUNDARY OTHERWISE. `digest` is the only thing tying
 * a client boundary hit back to the server render that threw — React strips
 * every other detail off a Server Component error before the client sees it —
 * and `cause` is where the interesting failure usually lives once a library
 * has re-thrown. Neither survives `stringifyUnknown`, which formats
 * `name`/`message`/`stack` and nothing else, so they are lifted into `params`
 * instead of being lost.
 */
export function errorMetadata(error: unknown): Record<string, string> {
    if (typeof error !== 'object' || error === null) return {};

    const { digest, cause } = error as { digest?: unknown; cause?: unknown };
    return {
        ...(typeof digest === 'string' && digest !== '' ? { digest } : {}),
        ...(cause === undefined ? {} : { cause: stringifyUnknown(cause, true) }),
    };
}

/**
 * Reports a client-originated error through `@intl-config`, the same way
 * `reportClientErrorAction` does — but converts the error to a string FIRST,
 * in the caller's own realm.
 *
 * THAT ORDER IS THE WHOLE POINT, and it is not a micro-optimisation. The
 * action it delegates to is `"use server"`, so React serialises its arguments
 * before the server ever runs: an `Error` instance is not serialisable, so
 * React substitutes a temporary reference, and what arrives server-side is a
 * `$$typeof`-tagged function carrying nothing about the failure.
 * `stringifyUnknown` running inside the action is therefore one boundary too
 * late — it can only report `[React internal reference could not be resolved
 * to a value]`, which is exactly what every client error report said before
 * this module existed. A string crosses the boundary intact.
 *
 * Deliberately carries NO `'use client'` directive: server-side callers
 * (`reportClientErrorDeferred` and friends) import this same specifier, and
 * stringifying first is correct there too — it just has nothing to survive.
 */
export default async function reportClientError(
    error: unknown,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    await reportClientErrorAction(
        stringifyUnknown(error, true),
        classOrMethodName,
        mergeReportParams(params, errorMetadata(error)),
    );
}
