const REPORT_ERROR_CALL = /\breportError\s*\(/g;
export function findReportErrorCalls(sourceText) {
    const calls = [];
    REPORT_ERROR_CALL.lastIndex = 0;
    let match;
    while ((match = REPORT_ERROR_CALL.exec(sourceText)) !== null) {
        calls.push(parseCallArgs(sourceText, match.index + match[0].length));
    }
    return calls;
}
function parseCallArgs(sourceText, start) {
    let depth = 1;
    let i = start;
    let firstArgEnd = -1;
    let callEnd = -1;
    while (i < sourceText.length && callEnd === -1) {
        const ch = sourceText[i];
        if (ch === '"' || ch === "'" || ch === '`') {
            i = skipStringLiteral(sourceText, i, ch);
            continue;
        }
        if (ch === '/' && sourceText[i + 1] === '/') {
            const nextNewline = sourceText.indexOf('\n', i);
            i = nextNewline === -1 ? sourceText.length : nextNewline;
            continue;
        }
        if (ch === '/' && sourceText[i + 1] === '*') {
            const end = sourceText.indexOf('*/', i + 2);
            i = end === -1 ? sourceText.length : end + 2;
            continue;
        }
        if (ch === '(' || ch === '{' || ch === '[') {
            depth += 1;
        }
        else if (ch === ')' || ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
                callEnd = i;
                break;
            }
        }
        else if (ch === ',' && depth === 1 && firstArgEnd === -1) {
            firstArgEnd = i;
        }
        i += 1;
    }
    if (firstArgEnd === -1 || callEnd === -1) {
        return { insertPos: null, hasExplicitUseAuthUser: false };
    }
    const paramsText = sourceText.slice(firstArgEnd + 1, callEnd);
    const hasExplicitUseAuthUser = /\buseAuthUser\b/.test(paramsText);
    const leadingWhitespace = paramsText.length - paramsText.trimStart().length;
    const paramsStart = firstArgEnd + 1 + leadingWhitespace;
    if (sourceText[paramsStart] !== '{') {
        return { insertPos: null, hasExplicitUseAuthUser };
    }
    return { insertPos: paramsStart + 1, hasExplicitUseAuthUser };
}
function skipStringLiteral(sourceText, start, quote) {
    let i = start + 1;
    while (i < sourceText.length) {
        if (sourceText[i] === '\\') {
            i += 2;
            continue;
        }
        if (sourceText[i] === quote)
            return i + 1;
        i += 1;
    }
    return sourceText.length;
}
