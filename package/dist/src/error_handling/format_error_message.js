import stringifyUnknown from './stringify_unknown.js';
function formatSection(title, value, isClient) {
    if (value === undefined)
        return '';
    const text = stringifyUnknown(value, isClient, true);
    if (!text || text === '{}' || text === '[]')
        return '';
    return `\n${title}: ${text}`;
}
export default function formatErrorMessage(params) {
    const { error, classOrMethodName, params: extraParams, isClient } = params;
    const errorText = stringifyUnknown(error, isClient);
    const paramsSection = formatSection('Params', extraParams, isClient);
    const clientSection = isClient ? '\nSource: client' : '';
    return `[${classOrMethodName}] Error: ${errorText}${paramsSection}${clientSection}`;
}
