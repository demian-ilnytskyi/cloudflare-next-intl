function lineOf(sourceText, index) {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (sourceText.charCodeAt(i) === 10)
            line++;
    }
    return line;
}
export function stripComments(sourceText) {
    let out = '';
    for (let i = 0; i < sourceText.length; i++) {
        if (sourceText[i] === '/' && sourceText[i + 1] === '*') {
            const end = sourceText.indexOf('*/', i + 2);
            const commentEnd = end === -1 ? sourceText.length : end + 2;
            for (let j = i; j < commentEnd; j++)
                out += sourceText[j] === '\n' ? '\n' : ' ';
            i = commentEnd - 1;
            continue;
        }
        if (sourceText[i] === '/' && sourceText[i + 1] === '/' && sourceText[i - 1] !== ':') {
            let end = sourceText.indexOf('\n', i);
            if (end === -1)
                end = sourceText.length;
            out += ' '.repeat(end - i);
            i = end - 1;
            continue;
        }
        out += sourceText[i];
    }
    return out;
}
const DYNAMIC_API_CHECKS = [
    { name: 'cookies()', pattern: /\bcookies\s*\(/ },
    { name: 'headers()', pattern: /\bheaders\s*\(\s*\)/ },
    { name: 'searchParams', pattern: /\bsearchParams\b/ },
    { name: 'unstable_noStore()', pattern: /\bunstable_noStore\s*\(/ },
    { name: 'connection()', pattern: /\bconnection\s*\(\s*\)/ },
    { name: 'cache: "no-store"', pattern: /cache:\s*['"]no-store['"]/ },
    { name: 'next: { revalidate: 0 }', pattern: /next:\s*\{\s*revalidate:\s*0\s*[,}]/ },
    { name: 'getAuthUser()', pattern: /\bgetAuthUser\s*\(/ },
    { name: 'withUserDb()', pattern: /\bwithUserDb\s*\(/ },
];
const USE_AUTH_USER_CALL = /\buseAuthUser\s*\(/;
const TRANSLATIONS_CALL_NO_LOCALE = /\b(?:getTranslations|useTranslations)\s*\(\s*(?:['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*\)/;
const SET_LOCALE_CALL = /\bsetLocale(?:Async)?\s*\(/;
export const USE_CLIENT_DIRECTIVE = /^(?:\s*['"]use \w[\w-]*['"]\s*;?\s*)*['"]use client['"]\s*;?/;
const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;
export function detectDynamicUsage(sourceText, extraChecks = []) {
    const code = stripComments(sourceText);
    const matches = [];
    for (const { name, pattern } of [...DYNAMIC_API_CHECKS, ...extraChecks]) {
        pattern.lastIndex = 0;
        const found = pattern.exec(code);
        if (found !== null)
            matches.push({ name, line: lineOf(sourceText, found.index) });
    }
    if (!USE_CLIENT_DIRECTIVE.test(sourceText)) {
        const found = USE_AUTH_USER_CALL.exec(code);
        if (found !== null)
            matches.push({ name: 'useAuthUser()', line: lineOf(sourceText, found.index) });
    }
    if (!SET_LOCALE_CALL.test(code)) {
        const found = TRANSLATIONS_CALL_NO_LOCALE.exec(code);
        if (found !== null)
            matches.push({ name: 'getTranslations()/useTranslations() (cookie-derived locale)', line: lineOf(sourceText, found.index) });
    }
    return {
        hasExplicitDynamicExport: EXPLICIT_DYNAMIC_EXPORT.test(code),
        detectedDynamicApis: matches.map((m) => m.name),
        matches,
    };
}
const EXPLICIT_DYNAMIC_EXPORT_VALUE = /export\s+const\s+dynamic\s*=\s*['"]([^'"]+)['"]/;
export function readExplicitDynamicValue(sourceText) {
    const match = EXPLICIT_DYNAMIC_EXPORT_VALUE.exec(stripComments(sourceText));
    if (match === null)
        return null;
    const value = match[1];
    if (value === 'force-static' || value === 'force-dynamic' || value === 'auto' || value === 'error')
        return value;
    return null;
}
