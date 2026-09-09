import formatErrorMessage from './format_error_message.js';
import stringifyUnknown from './stringify_unknown.js';
import { defaultIgnoredConsoleErrors } from './default_ignored_console_errors.js';
const DEFAULT_THROTTLE_MS = 5000;
export const consoleOverrideState = { active: false };
let lastDedupKey = null;
let lastReportedAt = 0;
function buildDedupKey(params) {
    return params.dedupKey ?? `${params.classOrMethodName} ${stringifyUnknown(params.error, params.isClient)} ${params.params ? stringifyUnknown(params.params, params.isClient) : ''}`;
}
async function callOnError(config, params) {
    const paramsWithFormattedMessage = { ...params, formattedMessage: formatErrorMessage(params) };
    if (config?.logToConsole !== false && !consoleOverrideState.active) {
        console.error(paramsWithFormattedMessage.formattedMessage);
    }
    if (config?.onError) {
        try {
            await config.onError(paramsWithFormattedMessage);
        }
        catch {
            if (!consoleOverrideState.active) {
                console.error(paramsWithFormattedMessage.formattedMessage);
            }
        }
    }
}
export default async function reportError(config, params) {
    const errorHandling = config?.errorHandling;
    if (errorHandling?.resetDedup) {
        lastDedupKey = null;
        lastReportedAt = 0;
        if (params.error === null || params.error === undefined)
            return;
    }
    if (errorHandling?.enable === false)
        return;
    if (params.consent !== undefined && params.consent !== true)
        return;
    const stringified = stringifyUnknown(params.error, params.isClient);
    const ignoreList = errorHandling?.ignoreConsoleErrors ?? defaultIgnoredConsoleErrors;
    if (ignoreList.some((ignored) => stringified.includes(ignored)))
        return;
    if (errorHandling?.ignoreConsoleError?.(stringified))
        return;
    if (errorHandling?.dedup !== false) {
        const throttleMs = errorHandling?.throttleMs ?? DEFAULT_THROTTLE_MS;
        const dedupKey = buildDedupKey(params);
        const now = Date.now();
        if (dedupKey === lastDedupKey && now - lastReportedAt < throttleMs)
            return;
        lastDedupKey = dedupKey;
        lastReportedAt = now;
    }
    let ctx;
    if (!params.isClient) {
        const generate = config?.generate;
        if (generate?.ctx) {
            ctx = typeof generate.ctx === 'function' ? generate.ctx() : generate.ctx;
        }
        else if (generate?.getCloudflareContext) {
            try {
                ctx = generate.getCloudflareContext({ async: false })?.ctx;
            }
            catch {
            }
        }
    }
    if (ctx?.waitUntil) {
        ctx.waitUntil(callOnError(errorHandling, params));
        return;
    }
    await callOnError(errorHandling, params);
}
