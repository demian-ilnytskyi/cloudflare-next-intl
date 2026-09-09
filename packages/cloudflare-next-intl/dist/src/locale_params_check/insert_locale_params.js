const ZERO_ARG_DEFAULT_EXPORT = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*(?=\(\s*\))/;
const ZERO_ARG_PARENS = /\(\s*\)/;
function findFunctionBodyStart(sourceText) {
    const match = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)[^{]*\{/.exec(sourceText);
    if (match === null)
        return null;
    return match.index + match[0].length;
}
export function insertLocaleParamsSignature(sourceText, localeParam) {
    const nameMatch = ZERO_ARG_DEFAULT_EXPORT.exec(sourceText);
    if (nameMatch === null)
        return sourceText;
    const parensMatch = ZERO_ARG_PARENS.exec(sourceText.slice(nameMatch.index + nameMatch[0].length));
    if (parensMatch === null)
        return sourceText;
    const parensStart = nameMatch.index + nameMatch[0].length + parensMatch.index;
    const parensEnd = parensStart + parensMatch[0].length;
    const replacement = `({ params }: {\n    params: Promise<{ ${localeParam}: Language }>;\n})`;
    return sourceText.slice(0, parensStart) + replacement + sourceText.slice(parensEnd);
}
const SYNC_DEFAULT_EXPORT_FUNCTION = /export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/;
function findUnusedContentName(sourceText, baseName) {
    let candidate = `${baseName}ContentCloudflareNextIntl`;
    let suffix = 2;
    while (new RegExp(`\\b${candidate}\\b`).test(sourceText)) {
        candidate = `${baseName}ContentCloudflareNextIntl${suffix}`;
        suffix += 1;
    }
    return candidate;
}
const DEFAULT_EXPORT_FUNCTION_OPEN_PAREN = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;
function findParamListSpan(sourceText) {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(sourceText);
    if (openParenMatch === null)
        return null;
    const start = openParenMatch.index + openParenMatch[0].length - 1;
    let depth = 0;
    for (let i = start; i < sourceText.length; i++) {
        if (sourceText[i] === '(')
            depth++;
        else if (sourceText[i] === ')') {
            depth--;
            if (depth === 0)
                return { start, end: i + 1 };
        }
    }
    return null;
}
function destructuredKeyNames(inner) {
    const names = [];
    let depth = 0;
    let start = 0;
    const parts = [];
    for (let i = 0; i <= inner.length; i++) {
        const char = inner[i];
        if (i === inner.length || (char === ',' && depth === 0)) {
            parts.push(inner.slice(start, i));
            start = i + 1;
            continue;
        }
        if (char === '{' || char === '(' || char === '[')
            depth++;
        else if (char === '}' || char === ')' || char === ']')
            depth--;
    }
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === '' || trimmed.startsWith('...'))
            continue;
        const key = trimmed.split(':')[0].split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(key))
            names.push(key);
    }
    return names;
}
export function wrapSyncDefaultExportWithParams(sourceText, localeParam, existingParamsType) {
    const nameMatch = SYNC_DEFAULT_EXPORT_FUNCTION.exec(sourceText);
    if (nameMatch === null)
        return sourceText;
    const name = nameMatch[1];
    const paramList = findParamListSpan(sourceText);
    if (paramList === null)
        return sourceText;
    const bodyStart = findFunctionBodyStart(sourceText);
    if (bodyStart === null)
        return sourceText;
    const bodyEnd = findMatchingBraceEnd(sourceText, bodyStart - 1);
    if (bodyEnd === null)
        return sourceText;
    const contentName = findUnusedContentName(sourceText, name);
    const originalParams = sourceText.slice(paramList.start, paramList.end);
    const originalBody = sourceText.slice(bodyStart, bodyEnd - 1);
    let forwardKeys = [];
    let forwardKeyTypes = [];
    if (originalParams !== '()') {
        const openBrace = originalParams.indexOf('{');
        if (openBrace === -1)
            return sourceText;
        const keysEnd = findMatchingBraceEnd(originalParams, openBrace);
        if (keysEnd === null)
            return sourceText;
        forwardKeys = destructuredKeyNames(originalParams.slice(openBrace + 1, keysEnd - 1));
        let j = keysEnd;
        while (j < originalParams.length && /\s/.test(originalParams[j]))
            j++;
        if (originalParams[j] === ':') {
            j++;
            while (j < originalParams.length && /\s/.test(originalParams[j]))
                j++;
            if (originalParams[j] === '{') {
                const typeEnd = findMatchingBraceEnd(originalParams, j);
                if (typeEnd !== null) {
                    const typeBody = originalParams.slice(j + 1, typeEnd - 1).trim();
                    forwardKeyTypes = typeBody === '' ? [] : typeBody.split(';').map((s) => s.trim()).filter(Boolean);
                }
            }
        }
    }
    const otherForwardKeys = forwardKeys.filter((key) => key !== 'params');
    const otherForwardKeyTypes = forwardKeyTypes.filter((type) => !/^params\s*:/.test(type));
    const contentFunction = `function ${contentName}${originalParams} {${originalBody}}`;
    const alreadyHasLocaleParam = existingParamsType !== undefined && new RegExp(`\\b${localeParam}\\b`).test(existingParamsType);
    const wrapperParamsType = existingParamsType === undefined
        ? `${localeParam}: Language`
        : alreadyHasLocaleParam
            ? existingParamsType
            : `${existingParamsType.replace(/;?\s*$/, '')}; ${localeParam}: Language`;
    const wrapperSignature = otherForwardKeys.length === 0 ? `{ params }` : `{ ${otherForwardKeys.join(', ')}, params }`;
    const forwardedJsx = forwardKeys.map((key) => (key === 'params' ? ` params={params}` : ` ${key}={${key}}`)).join('');
    const forwardedTypeLines = otherForwardKeyTypes.map((type) => `    ${type.replace(/;?\s*$/, '')};`);
    const wrapperFunction = [
        `// Auto-inserted by cloudflare-next-intl's checkLocaleParams (mode: "fix") — `
            + `"${name}" was split into this async wrapper plus the sync "${contentName}" above `
            + `it (see that function's own body, unchanged) so \`await params\` never lands in a `
            + `function this scan didn't confirm was safe to make async. To opt this file out on a `
            + `later run, pass it in checkLocaleParams' \`skip\` list instead of hand-editing here.`,
        `export default async function ${name}(${wrapperSignature}: {`,
        ...forwardedTypeLines,
        `    params: Promise<{ ${wrapperParamsType} }>;`,
        `}) {`,
        `    const { ${localeParam} } = await params;`,
        `    setLocale(${localeParam});`,
        ``,
        `    return <${contentName}${forwardedJsx} />;`,
        `}`,
    ].join('\n');
    return sourceText.slice(0, nameMatch.index) + contentFunction + '\n\n' + wrapperFunction + sourceText.slice(bodyEnd);
}
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
function findDestructuredObjectSpans(sourceText) {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(sourceText);
    if (openParenMatch === null)
        return null;
    let i = openParenMatch.index + openParenMatch[0].length;
    while (i < sourceText.length && /\s/.test(sourceText[i]))
        i++;
    if (sourceText[i] !== '{')
        return null;
    const keysBraceEnd = findMatchingBraceEnd(sourceText, i);
    if (keysBraceEnd === null)
        return null;
    let j = keysBraceEnd;
    while (j < sourceText.length && /\s/.test(sourceText[j]))
        j++;
    if (sourceText[j] !== ':')
        return null;
    j++;
    while (j < sourceText.length && /\s/.test(sourceText[j]))
        j++;
    if (sourceText[j] !== '{')
        return null;
    const typeBraceEnd = findMatchingBraceEnd(sourceText, j);
    if (typeBraceEnd === null)
        return null;
    return { keysStart: i + 1, keysEnd: keysBraceEnd - 1, typeStart: j + 1, typeEnd: typeBraceEnd - 1 };
}
export function addParamsPropToExistingDestructure(sourceText, localeParam) {
    const spans = findDestructuredObjectSpans(sourceText);
    if (spans === null)
        return sourceText;
    const { keysStart, keysEnd, typeStart, typeEnd } = spans;
    const keys = sourceText.slice(keysStart, keysEnd);
    const typeBody = sourceText.slice(typeStart, typeEnd);
    const keysTrimmedEnd = keysStart + keys.replace(/\s+$/, '').length;
    const typeTrimmedEnd = typeStart + typeBody.replace(/\s+$/, '').length;
    const keysSeparator = keys.trim() === '' || /,\s*$/.test(sourceText.slice(keysStart, keysTrimmedEnd)) ? '' : ',';
    const typeSeparator = typeBody.trim() === '' || /;\s*$/.test(sourceText.slice(typeStart, typeTrimmedEnd)) ? '' : ';';
    let result = `${sourceText.slice(0, typeTrimmedEnd)}${typeSeparator} params: Promise<{ ${localeParam}: Language }>; ${sourceText.slice(typeEnd)}`;
    result = `${result.slice(0, keysTrimmedEnd)}${keysSeparator} params ${result.slice(keysEnd)}`;
    return result;
}
export function insertLocaleParamsBody(sourceText, localeParam, hasInlineDestructure) {
    if (hasInlineDestructure) {
        const destructureRegex = new RegExp(`(\\{[^}]*\\b${localeParam}\\b[^}]*\\}\\s*=\\s*await\\s+params\\s*;)`);
        const destructureMatch = destructureRegex.exec(sourceText);
        if (destructureMatch === null)
            return sourceText;
        const at = destructureMatch.index + destructureMatch[0].length;
        return `${sourceText.slice(0, at)}\n    setLocale(${localeParam});${sourceText.slice(at)}`;
    }
    const bodyStart = findFunctionBodyStart(sourceText);
    if (bodyStart === null)
        return sourceText;
    const line = `\n    const { ${localeParam} } = await params;\n    setLocale(${localeParam});\n`;
    return sourceText.slice(0, bodyStart) + line + sourceText.slice(bodyStart);
}
const PARAMS_PROMISE_TYPE = /params\s*:\s*Promise<\{([^}]*)\}>/;
export function extractParamsPromiseType(sourceText) {
    return PARAMS_PROMISE_TYPE.exec(sourceText)?.[1]?.trim() ?? null;
}
export function ensureLocaleInParamsType(sourceText, localeParam) {
    const match = PARAMS_PROMISE_TYPE.exec(sourceText);
    if (match === null)
        return sourceText;
    const inner = match[1];
    if (new RegExp(`\\b${localeParam}\\b`).test(inner))
        return sourceText;
    const contentStart = match.index + match[0].indexOf('{') + 1;
    const trimmedLength = inner.replace(/\s+$/, '').length;
    const insertAt = contentStart + trimmedLength;
    const separator = /;\s*$/.test(inner.slice(0, trimmedLength)) || inner.trim() === '' ? '' : ';';
    return `${sourceText.slice(0, insertAt)}${separator} ${localeParam}: Language ${sourceText.slice(insertAt + (inner.length - trimmedLength))}`;
}
const CLOUDFLARE_NEXT_INTL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]cloudflare-next-intl['"]\s*;?/;
export function ensureSetLocaleImport(sourceText) {
    const match = CLOUDFLARE_NEXT_INTL_IMPORT.exec(sourceText);
    if (match === null) {
        return `import { setLocale } from "cloudflare-next-intl";\n${sourceText}`;
    }
    const names = match[1];
    if (/\bsetLocale\b/.test(names))
        return sourceText;
    const replacement = match[0].replace(names, `${names.replace(/\s*$/, '')}, setLocale `);
    return sourceText.slice(0, match.index) + replacement + sourceText.slice(match.index + match[0].length);
}
