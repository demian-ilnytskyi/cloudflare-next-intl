import { stripComments } from '../dynamic_pages_check/detect_dynamic_usage.js';
const SET_LOCALE_ASYNC_CALL = /\bsetLocaleAsync\s*\(\s*params\s*\)/;
const SET_LOCALE_CALL = /\bsetLocale(?:Cache)?\s*\(/;
function inlineDestructureRegex(localeParam) {
    return new RegExp(`\\{[^}]*\\b${localeParam}\\b[^}]*\\}\\s*=\\s*await\\s+params\\b`);
}
function paramsTypeRegex(localeParam) {
    return new RegExp(`params\\s*:\\s*Promise<\\{[^}]*\\b${localeParam}\\b`);
}
const DESTRUCTURED_PARAMS_PROP = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(\s*\{[^}]*(?<![\w$:])params(?![\w$:])[^}]*\}/;
const DEFAULT_EXPORT_FUNCTION_OPEN_PAREN = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;
function findMatchingBraceEnd(code, openBraceIndex) {
    let depth = 0;
    for (let i = openBraceIndex; i < code.length; i++) {
        if (code[i] === '{')
            depth++;
        else if (code[i] === '}') {
            depth--;
            if (depth === 0)
                return i + 1;
        }
    }
    return null;
}
function findDestructuredObjectWithInlineType(code) {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(code);
    if (openParenMatch === null)
        return null;
    let i = openParenMatch.index + openParenMatch[0].length;
    while (i < code.length && /\s/.test(code[i]))
        i++;
    if (code[i] !== '{')
        return null;
    const keysEnd = findMatchingBraceEnd(code, i);
    if (keysEnd === null)
        return null;
    const keys = code.slice(i + 1, keysEnd - 1);
    let j = keysEnd;
    while (j < code.length && /\s/.test(code[j]))
        j++;
    if (code[j] !== ':')
        return null;
    j++;
    while (j < code.length && /\s/.test(code[j]))
        j++;
    if (code[j] !== '{')
        return null;
    const typeEnd = findMatchingBraceEnd(code, j);
    if (typeEnd === null)
        return null;
    const typeBody = code.slice(j + 1, typeEnd - 1);
    return { keys, typeBody };
}
function declaredBindingNames(code) {
    const names = new Set();
    const declRegex = /\b(?:const|let|var)\s+([^=;]+)=/g;
    let declMatch;
    while ((declMatch = declRegex.exec(code)) !== null) {
        const target = declMatch[1];
        if (/^[A-Za-z_$][\w$]*\s*$/.test(target)) {
            names.add(target.trim());
            continue;
        }
        const braceMatch = /^\{([\s\S]*)\}\s*$/.exec(target.trim());
        if (braceMatch === null)
            continue;
        for (const part of braceMatch[1].split(',')) {
            const key = part.split(':')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(key))
                names.add(key);
        }
    }
    return names;
}
export function detectLocaleParams(sourceText, localeParam) {
    const code = stripComments(sourceText);
    const hasSetLocaleAsync = SET_LOCALE_ASYNC_CALL.test(code);
    const hasInlineDestructure = inlineDestructureRegex(localeParam).test(code);
    const hasSetLocaleCall = hasSetLocaleAsync || SET_LOCALE_CALL.test(code);
    const hasConflictingLocaleBinding = !hasInlineDestructure && declaredBindingNames(code).has(localeParam);
    const hasDestructuredParamsProp = DESTRUCTURED_PARAMS_PROP.test(code);
    const destructuredObject = findDestructuredObjectWithInlineType(code);
    const hasAnyParamsKey = /(?<![\w$])params(?![\w$])/.test(destructuredObject?.keys ?? '');
    const hasDestructuredObjectWithoutParams = !hasDestructuredParamsProp
        && destructuredObject !== null
        && !hasAnyParamsKey;
    return {
        hasInlineDestructure,
        hasSetLocaleCall,
        hasLocaleParamSetup: hasSetLocaleAsync || (hasInlineDestructure && hasSetLocaleCall),
        hasParamsType: paramsTypeRegex(localeParam).test(code),
        hasDestructuredParamsProp,
        hasConflictingLocaleBinding,
        hasDestructuredObjectWithoutParams,
    };
}
