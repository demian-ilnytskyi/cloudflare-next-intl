export interface ReportErrorCall {
    /**
     * Index in the source text right after the `{` that opens the second
     * argument's object literal — the spot to insert `useAuthUser: true, `.
     * `null` when the second argument isn't a plain object literal (a bare
     * identifier, a function call building it elsewhere, `undefined`, ...)
     * — such a call is left alone by any caller.
     */
    insertPos: number | null;
    /**
     * Whether `useAuthUser` already appears as an identifier inside the
     * second argument's text. When `true`, leave this call alone even if
     * `insertPos` is non-null, so an explicit `useAuthUser: false` (or a
     * variable named `useAuthUser` passed via shorthand) is never
     * overwritten.
     */
    hasExplicitUseAuthUser: boolean;
}

const REPORT_ERROR_CALL = /\breportError\s*\(/g;

/**
 * Finds every `reportError(config, params)` call in a file's text and
 * locates where a `useAuthUser: true,` property could be inserted into its
 * second argument. Text-based, same heuristic class as the rest of this
 * module: tracks bracket depth across all three bracket kinds together
 * (matching `insertDynamicExport`'s own simplification) and skips over
 * string/template literals and comments so a comma or brace inside one
 * never miscounts. Deliberately conservative — any call shape this can't
 * confidently parse is returned with `insertPos: null`.
 */
export function findReportErrorCalls(sourceText: string): ReportErrorCall[] {
    const calls: ReportErrorCall[] = [];
    REPORT_ERROR_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REPORT_ERROR_CALL.exec(sourceText)) !== null) {
        calls.push(parseCallArgs(sourceText, match.index + match[0].length));
    }
    return calls;
}

function parseCallArgs(sourceText: string, start: number): ReportErrorCall {
    let depth = 1; // already inside the call's own opening '('
    let i = start;
    let firstArgEnd = -1; // index of the top-level comma separating arg1 from arg2
    let callEnd = -1; // index of the call's closing ')'

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
        } else if (ch === ')' || ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
                callEnd = i;
                break;
            }
        } else if (ch === ',' && depth === 1 && firstArgEnd === -1) {
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

function skipStringLiteral(sourceText: string, start: number, quote: string): number {
    let i = start + 1;
    while (i < sourceText.length) {
        if (sourceText[i] === '\\') {
            i += 2;
            continue;
        }
        if (sourceText[i] === quote) return i + 1;
        i += 1;
    }
    return sourceText.length;
}
