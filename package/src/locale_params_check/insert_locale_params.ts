/**
 * Matches a zero-argument `export default (async) function Name(` — the
 * only signature shape this codemod rewrites the parameter list of. Any
 * other shape (existing params, arrow function, non-default export) is left
 * to `insertLocaleParamsBody` alone, which only ever touches the function
 * body, never a signature.
 */
const ZERO_ARG_DEFAULT_EXPORT = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*(?=\(\s*\))/;
const ZERO_ARG_PARENS = /\(\s*\)/;

/**
 * Matches `export default async function Name({ params }...` — i.e. a
 * default-exported function whose first (and only) destructured parameter
 * is named `params`, so its body can be given a locale-resolving statement
 * without touching the signature. Captures up through the opening `{` of
 * the function body so the caller can insert right after it; deliberately
 * conservative (bails via `null` on anything more exotic — multiple
 * top-level params, non-destructured `params`, a body on the same line as
 * the signature) rather than guessing where the body starts.
 */
function findFunctionBodyStart(sourceText: string): number | null {
    const match = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)[^{]*\{/.exec(sourceText);
    if (match === null) return null;
    return match.index + match[0].length;
}

/**
 * Rewrites a zero-argument `export default (async) function Name()` into
 * `export default (async) function Name({ params }: { params:
 * Promise<{ <localeParam>: Language }> })`, or returns the source
 * unchanged if no zero-arg default export is found.
 */
export function insertLocaleParamsSignature(sourceText: string, localeParam: string): string {
    const nameMatch = ZERO_ARG_DEFAULT_EXPORT.exec(sourceText);
    if (nameMatch === null) return sourceText;
    const parensMatch = ZERO_ARG_PARENS.exec(sourceText.slice(nameMatch.index + nameMatch[0].length));
    if (parensMatch === null) return sourceText;
    const parensStart = nameMatch.index + nameMatch[0].length + parensMatch.index;
    const parensEnd = parensStart + parensMatch[0].length;
    const replacement = `({ params }: {\n    params: Promise<{ ${localeParam}: Language }>;\n})`;
    return sourceText.slice(0, parensStart) + replacement + sourceText.slice(parensEnd);
}

const DEFAULT_EXPORT_FUNCTION_OPEN_PAREN = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;

/**
 * Brace-depth-aware match end — see `detect_locale_params.ts`'s identical
 * helper for why this can't be a `[^}]*`-style regex (a nested object type
 * like `Promise<{ locale: Language }>` inside the outer type would close
 * the match early).
 */
function findMatchingBraceEnd(code: string, openBraceIndex: number): number | null {
    let depth = 0;
    for (let i = openBraceIndex; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return null;
}

/**
 * Locates the default-exported function's destructured key span and its
 * immediately-following plain inline object type span (both as `[start,
 * end)` byte ranges into `sourceText`, `end` exclusive of the closing `}`)
 * — mirrors `detect_locale_params.ts`'s `findDestructuredObjectWithInlineType`,
 * duplicated here (rather than imported) since the two files have no shared
 * internals module and each needs slightly different output (spans to
 * splice vs. text to inspect).
 */
function findDestructuredObjectSpans(
    sourceText: string,
): { keysStart: number; keysEnd: number; typeStart: number; typeEnd: number } | null {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(sourceText);
    if (openParenMatch === null) return null;
    let i = openParenMatch.index + openParenMatch[0].length;
    while (i < sourceText.length && /\s/.test(sourceText[i]!)) i++;
    if (sourceText[i] !== '{') return null;
    const keysBraceEnd = findMatchingBraceEnd(sourceText, i);
    if (keysBraceEnd === null) return null;

    let j = keysBraceEnd;
    while (j < sourceText.length && /\s/.test(sourceText[j]!)) j++;
    if (sourceText[j] !== ':') return null;
    j++;
    while (j < sourceText.length && /\s/.test(sourceText[j]!)) j++;
    if (sourceText[j] !== '{') return null;
    const typeBraceEnd = findMatchingBraceEnd(sourceText, j);
    if (typeBraceEnd === null) return null;

    return { keysStart: i + 1, keysEnd: keysBraceEnd - 1, typeStart: j + 1, typeEnd: typeBraceEnd - 1 };
}

/**
 * Adds `params` as an ADDITIONAL destructured key (and an additional
 * `params: Promise<{ <localeParam>: Language }>` property on the inline
 * type) to a default-exported function whose existing single props object
 * has no `params` key at all — e.g. a loading/page component whose prop was
 * renamed away from Next's `params` convention (`{ test }: { test: ... }`).
 * Never adds a second function PARAMETER: Next.js always calls a route
 * component with exactly one props object, so a second argument would never
 * receive real route params at runtime — only a second KEY on the existing
 * one does. Returns the source unchanged if no such shape is found (callers
 * should check `detectLocaleParams`'s `hasDestructuredObjectWithoutParams`
 * first and only call this when that's true).
 */
export function addParamsPropToExistingDestructure(sourceText: string, localeParam: string): string {
    const spans = findDestructuredObjectSpans(sourceText);
    if (spans === null) return sourceText;
    const { keysStart, keysEnd, typeStart, typeEnd } = spans;

    const keys = sourceText.slice(keysStart, keysEnd);
    const typeBody = sourceText.slice(typeStart, typeEnd);
    const keysTrimmedEnd = keysStart + keys.replace(/\s+$/, '').length;
    const typeTrimmedEnd = typeStart + typeBody.replace(/\s+$/, '').length;
    const keysSeparator = keys.trim() === '' || /,\s*$/.test(sourceText.slice(keysStart, keysTrimmedEnd)) ? '' : ',';
    const typeSeparator = typeBody.trim() === '' || /;\s*$/.test(sourceText.slice(typeStart, typeTrimmedEnd)) ? '' : ';';

    // Apply the LATER edit first so the earlier span's offsets stay valid.
    let result = `${sourceText.slice(0, typeTrimmedEnd)}${typeSeparator} params: Promise<{ ${localeParam}: Language }>; ${sourceText.slice(typeEnd)}`;
    result = `${result.slice(0, keysTrimmedEnd)}${keysSeparator} params ${result.slice(keysEnd)}`;
    return result;
}

/**
 * Inserts `const { <localeParam> } = await params;\nsetLocale(<localeParam>);`
 * as the first statement of the default-exported function's body —
 * skipping the `const { <localeParam> } = await params;` half if the file
 * already has an equivalent inline destructure (so `fix` never produces two
 * `await params` reads), and doing nothing at all if `setLocaleAsync(params)`
 * or an equivalent destructure is already present (callers should check
 * `detectLocaleParams` first and only call this when setup is missing).
 *
 * @param hasInlineDestructure Whether the file already has
 * `const { <localeParam> } = await params` (from `detectLocaleParams`) —
 * when true, only the `setLocale(<localeParam>)` line is added, right after
 * the existing destructure, not a second one.
 */
export function insertLocaleParamsBody(sourceText: string, localeParam: string, hasInlineDestructure: boolean): string {
    if (hasInlineDestructure) {
        const destructureRegex = new RegExp(`(\\{[^}]*\\b${localeParam}\\b[^}]*\\}\\s*=\\s*await\\s+params\\s*;)`);
        const destructureMatch = destructureRegex.exec(sourceText);
        if (destructureMatch === null) return sourceText;
        const at = destructureMatch.index + destructureMatch[0].length;
        return `${sourceText.slice(0, at)}\n    setLocale(${localeParam});${sourceText.slice(at)}`;
    }

    const bodyStart = findFunctionBodyStart(sourceText);
    if (bodyStart === null) return sourceText;
    const line = `\n    const { ${localeParam} } = await params;\n    setLocale(${localeParam});\n`;
    return sourceText.slice(0, bodyStart) + line + sourceText.slice(bodyStart);
}

const PARAMS_PROMISE_TYPE = /params\s*:\s*Promise<\{([^}]*)\}>/;

/**
 * Ensures the existing `params: Promise<{ ... }>` type includes
 * `<localeParam>: Language` — for a file being fixed via the "reuse an
 * existing `{ params }` prop" path (`checkLocaleParams`'s
 * `canReuseExistingParams`), the prop might already be typed for an
 * unrelated dynamic segment (e.g. `Promise<{ ownerId: string }>` on a
 * `[locale]/property-profile/[ownerId]/...` route) that simply doesn't
 * mention `<localeParam>` yet — inserting `const { <localeParam> } = await
 * params` without first widening the type would destructure a key that
 * isn't actually there. Appends `; <localeParam>: Language` right before
 * the closing `}` of the FIRST `params: Promise<{...}>` match; a no-op if
 * that type already mentions `<localeParam>`, or if no such type is found
 * at all (the zero-arg-signature path already writes a type that includes
 * it from the start, so this only ever needs to run for the reuse path).
 */
export function ensureLocaleInParamsType(sourceText: string, localeParam: string): string {
    const match = PARAMS_PROMISE_TYPE.exec(sourceText);
    if (match === null) return sourceText;
    const inner = match[1]!;
    if (new RegExp(`\\b${localeParam}\\b`).test(inner)) return sourceText;
    // Insert right after the trimmed-right end of the existing content
    // (not at the literal closing `}`), so its own trailing whitespace is
    // replaced rather than left dangling before the inserted text. The
    // capture group always starts right after `Promise<{`, computed
    // structurally rather than via `indexOf` — `inner` can be an empty
    // string (`Promise<{}>`), which `indexOf('')` would misreport as the
    // start of the whole match instead of the position right after `{`.
    const contentStart = match.index + match[0].indexOf('{') + 1;
    const trimmedLength = inner.replace(/\s+$/, '').length;
    const insertAt = contentStart + trimmedLength;
    const separator = /;\s*$/.test(inner.slice(0, trimmedLength)) || inner.trim() === '' ? '' : ';';
    return `${sourceText.slice(0, insertAt)}${separator} ${localeParam}: Language ${sourceText.slice(insertAt + (inner.length - trimmedLength))}`;
}

const CLOUDFLARE_NEXT_INTL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]cloudflare-next-intl['"]\s*;?/;

/**
 * Ensures `setLocale` is importable from `'cloudflare-next-intl'` in a file
 * this codemod just gave a `setLocale(...)` call to — merges it into an
 * existing named import from that package if there is one (skipped
 * entirely if that import already lists `setLocale`), otherwise adds a new
 * `import { setLocale } from "cloudflare-next-intl";` at the top of the
 * file. A file whose only existing import is aliased (`as`) or a
 * namespace/default import is left with a new import line rather than an
 * attempted merge, since neither shape gains a plain `setLocale` safely.
 */
export function ensureSetLocaleImport(sourceText: string): string {
    const match = CLOUDFLARE_NEXT_INTL_IMPORT.exec(sourceText);
    if (match === null) {
        return `import { setLocale } from "cloudflare-next-intl";\n${sourceText}`;
    }
    const names = match[1]!;
    if (/\bsetLocale\b/.test(names)) return sourceText;
    const replacement = match[0].replace(names, `${names.replace(/\s*$/, '')}, setLocale `);
    return sourceText.slice(0, match.index) + replacement + sourceText.slice(match.index + match[0].length);
}
