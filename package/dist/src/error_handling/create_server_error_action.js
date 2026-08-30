import reportError from './report_error.js';
import stringifyUnknown from './stringify_unknown.js';
async function resolveRequestContext() {
    try {
        const { headers } = await import('next/headers');
        const headerList = await headers();
        return {
            path: headerList.get('x-pathname') ?? undefined,
            userAgent: headerList.get('user-agent') ?? undefined,
            referer: headerList.get('referer') ?? undefined,
        };
    }
    catch {
        return {};
    }
}
export default function createServerErrorAction(config) {
    return async function reportClientError(error, classOrMethodName, params) {
        const requestContext = await resolveRequestContext();
        const isPlainParamsObject = typeof params === 'object' && params !== null && !Array.isArray(params);
        const mergedParams = params === undefined
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
    };
}
