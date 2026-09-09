import type { ErrorHandlingParams } from '../types/types.js';

/**
 * Folds extra report fields into a caller's own `params`, without ever
 * destroying what the caller passed.
 *
 * ONE FUNCTION, TWO REALMS, on purpose. `report_client_error.ts` folds in
 * `digest`/`cause` in the browser and `report_client_error_core.ts` folds in
 * `requestContext` on the server, and the two run back to back on the same
 * report — two copies of this rule is how a caller's array params end up
 * nested by one side and spread by the other.
 *
 * A plain object is spread. An array or primitive is NESTED under `params`
 * rather than spread: spreading an array yields `{0: 'a', 1: 'b'}`, and
 * spreading a primitive yields nothing at all, so both would lose the value
 * the caller wanted reported. `undefined` params become the extras alone.
 */
export default function mergeReportParams(
    params: ErrorHandlingParams['params'],
    extra: Record<string, unknown>,
): ErrorHandlingParams['params'] {
    if (Object.keys(extra).length === 0) return params;
    if (params === undefined) return extra;
    if (typeof params === 'object' && params !== null && !Array.isArray(params)) return { ...params, ...extra };

    return { params, ...extra };
}
