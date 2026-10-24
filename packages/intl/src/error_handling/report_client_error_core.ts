import type { ErrorHandlingParams } from '../types/types.js';
import reportError, { type ReportErrorConfig } from './report_error.js';
import stringifyUnknown from './stringify_unknown.js';
import mergeReportParams from './merge_report_params.js';

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
 * and `reportClientError` (config read from `@intl-config`).
 * Attaches `requestContext` alongside `params`, and runs `stringifyUnknown`
 * as a LAST-RESORT net only — by the time a client report reaches here the
 * serialization boundary is already behind it, so anything React could
 * destroy is already destroyed. Converting early enough to matter is
 * `report_client_error.ts`'s job, in the caller's own realm; this call exists
 * for direct server-side callers passing a live value.
 */
export async function reportClientErrorCore(
    config: ReportErrorConfig | undefined,
    error: unknown,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    const mergedParams = mergeReportParams(params, { requestContext: await resolveRequestContext() });

    await reportError(config, {
        error: stringifyUnknown(error, true),
        classOrMethodName,
        params: mergedParams,
        isClient: true,
    });
}
