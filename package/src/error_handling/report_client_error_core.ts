import type { ErrorHandlingParams } from '../types/types.js';
import reportError, { type ReportErrorConfig } from './report_error.js';
import stringifyUnknown from './stringify_unknown.js';

/**
 * Reads request context (page path, user agent, referer) via `next/headers`
 * for a client-originated error report. `path` comes from `x-pathname`, set
 * by `intlMiddleware` (this package's own middleware) — falls back to
 * `undefined` when a header is missing (e.g. middleware didn't run for this
 * request) rather than throwing.
 */
async function resolveRequestContext(): Promise<{ path?: string; userAgent?: string; referer?: string }> {
    try {
        const { headers } = await import('next/headers.js');
        const headerList = await headers();
        return {
            path: headerList.get('x-pathname') ?? undefined,
            userAgent: headerList.get('user-agent') ?? undefined,
            referer: headerList.get('referer') ?? undefined,
        };
    } catch {
        return {};
    }
}

/**
 * Shared body behind both `createServerErrorAction` (config bound per call)
 * and `reportClientError` (config read from `setErrorHandlingActionConfig`).
 * Stringifies `error` before it would otherwise cross a serialization
 * boundary — including React's own unresolved-reference stubs, via
 * `stringifyUnknown` — and attaches `requestContext` alongside `params`.
 */
export async function reportClientErrorCore(
    config: ReportErrorConfig | undefined,
    error: unknown,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    const requestContext = await resolveRequestContext();
    const isPlainParamsObject = typeof params === 'object' && params !== null && !Array.isArray(params);
    const mergedParams =
        params === undefined
            ? { requestContext }
            : isPlainParamsObject
                ? { ...params, requestContext }
                : { params, requestContext };

    await reportError(config, {
        error: stringifyUnknown(error, true),
        classOrMethodName,
        params: mergedParams,
        isClient: true,
    });
}
