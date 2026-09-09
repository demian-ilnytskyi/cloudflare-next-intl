import { stripComments } from '../dynamic_pages_check/detect_dynamic_usage.js';

export interface LocaleParamsDetectionResult {
    /** Whether the file already destructures `{ locale }` from its `params` prop, via an inline `const { locale } = await params`. */
    hasInlineDestructure: boolean;
    /** Whether `setLocale(...)`/`setLocaleAsync(params)` is already called somewhere in the file — the package's own cache-population step. */
    hasSetLocaleCall: boolean;
    /**
     * Whether the file is already fully set up: either `setLocaleAsync(params)`
     * (which both resolves and caches the locale in one call), or an inline
     * destructure paired with its own `setLocale(<localeParam>)` call. `true`
     * here means nothing needs to change; `false` with `hasInlineDestructure:
     * true` means only a `setLocale(<localeParam>)` call is missing.
     */
    hasLocaleParamSetup: boolean;
    /** Whether the file's own `params` prop type already includes the locale param (e.g. `Promise<{ locale: Language }>`). */
    hasParamsType: boolean;
    /**
     * Whether the default-exported function's own signature destructures a
     * plain `{ params }` (possibly alongside other props, e.g. `{ children,
     * params }`) — i.e. `params` is a bound variable this file can safely
     * `await`, as opposed to some other shape (an aliased `{ params:
     * routeParams }`, a non-destructured single argument, no `params` at
     * all) this scan doesn't try to reason about.
     */
    hasDestructuredParamsProp: boolean;
    /**
     * Whether `<localeParam>` is already declared as a binding somewhere in
     * the file OUTSIDE the recognized inline-destructure pattern (e.g. `const
     * locale = result?.locale ?? "en"`, a different destructure, a function
     * parameter of that name). `true` here means inserting a fresh `const
     * <localeParam> = ...` would collide with (or shadow) existing code, so
     * it's unsafe to auto-fix even when `hasDestructuredParamsProp` is true.
     */
    hasConflictingLocaleBinding: boolean;
    /**
     * Whether the default-exported function destructures SOME object as its
     * first parameter (any keys — `{ test }`, `{ children }`, ...) but that
     * object has NO `params` key at all. This is the "wrong prop name
     * entirely" shape — e.g. a loading/page component whose single prop was
     * renamed away from Next's `params` convention to something else. Since
     * Next.js always calls a route component with exactly one props object,
     * the safe fix here is adding `params` as an ADDITIONAL destructured key
     * (and an additional property on the inline type), never a second
     * function parameter — Next would never populate a second argument.
     * `true` only when the type annotation is a plain inline object literal
     * (`{ ...: ...; }`) this scan can safely extend; a `Readonly<{...}>` or
     * any other wrapped/aliased type is left alone (`hasDestructuredParamsProp`
     * and this are mutually exclusive by construction — a real `params` key
     * already present takes the other path instead).
     */
    hasDestructuredObjectWithoutParams: boolean;
}

const SET_LOCALE_ASYNC_CALL = /\bsetLocaleAsync\s*\(\s*params\s*\)/;
const SET_LOCALE_CALL = /\bsetLocale(?:Cache)?\s*\(/;

/**
 * @param localeParam The dynamic segment name resolving to the locale (e.g.
 * `'locale'` for `[locale]`, `'lang'` for `[lang]`).
 */
function inlineDestructureRegex(localeParam: string): RegExp {
    return new RegExp(`\\{[^}]*\\b${localeParam}\\b[^}]*\\}\\s*=\\s*await\\s+params\\b`);
}

function paramsTypeRegex(localeParam: string): RegExp {
    return new RegExp(`params\\s*:\\s*Promise<\\{[^}]*\\b${localeParam}\\b`);
}

// Matches the default-exported function's own parameter list only when its
// first (and only) parameter is a destructuring pattern that includes a
// plain `params` key — `({ params })`, `({ children, params })`, `({
// params, children })`, in either order, single- or multi-line. Deliberately
// does NOT match an alias (`{ params: routeParams }`) or a non-destructured
// single argument (`(props)`) — those need a human to confirm `params` is
// actually a `Promise` this scan can safely `await`.
const DESTRUCTURED_PARAMS_PROP = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(\s*\{[^}]*(?<![\w$:])params(?![\w$:])[^}]*\}/;

const DEFAULT_EXPORT_FUNCTION_OPEN_PAREN = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;

/**
 * Given `code` and the index of an opening `{`, returns the index just
 * past its matching closing `}` (brace-depth aware, so a nested object type
 * like `Promise<{ locale: Language }>` inside a params type doesn't
 * prematurely close the outer span) — or `null` if the braces never
 * balance before the string ends.
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
 * Finds the default-exported function's destructured parameter list AND its
 * immediately-following plain inline object type (`{ ...: ...; }`), both
 * spans located brace-depth-aware so a nested type (`Promise<{ locale:
 * Language }>`) inside the type annotation doesn't truncate the match.
 * Deliberately excludes anything wrapped (`Readonly<{...}>`, a named type, a
 * union) — the type span must open with `{` immediately after `:`, or this
 * returns `null`, since only a bare inline object literal is safe for
 * `insertLocaleParamsSignature`'s sibling to extend with an additional
 * property.
 */
function findDestructuredObjectWithInlineType(code: string): { keys: string; typeBody: string } | null {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(code);
    if (openParenMatch === null) return null;
    let i = openParenMatch.index + openParenMatch[0].length;
    while (i < code.length && /\s/.test(code[i]!)) i++;
    if (code[i] !== '{') return null;
    const keysEnd = findMatchingBraceEnd(code, i);
    if (keysEnd === null) return null;
    const keys = code.slice(i + 1, keysEnd - 1);

    let j = keysEnd;
    while (j < code.length && /\s/.test(code[j]!)) j++;
    if (code[j] !== ':') return null;
    j++;
    while (j < code.length && /\s/.test(code[j]!)) j++;
    if (code[j] !== '{') return null;
    const typeEnd = findMatchingBraceEnd(code, j);
    if (typeEnd === null) return null;
    const typeBody = code.slice(j + 1, typeEnd - 1);

    return { keys, typeBody };
}

/**
 * Every `const`/`let`/`var` NAME binding in the file — a plain declared
 * identifier, or each key of a destructuring pattern that ISN'T itself
 * immediately followed by `: alias` (an aliased destructure binds the
 * alias, not the key name, so it's excluded) — used to check whether
 * `localeParam` is already bound somewhere this scan's own inline-
 * destructure regex doesn't recognize.
 */
function declaredBindingNames(code: string): Set<string> {
    const names = new Set<string>();
    const declRegex = /\b(?:const|let|var)\s+([^=;]+)=/g;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declRegex.exec(code)) !== null) {
        const target = declMatch[1]!;
        if (/^[A-Za-z_$][\w$]*\s*$/.test(target)) {
            names.add(target.trim());
            continue;
        }
        const braceMatch = /^\{([\s\S]*)\}\s*$/.exec(target.trim());
        if (braceMatch === null) continue;
        for (const part of braceMatch[1]!.split(',')) {
            const key = part.split(':')[0]!.trim();
            if (/^[A-Za-z_$][\w$]*$/.test(key)) names.add(key);
        }
    }
    return names;
}

/**
 * Detects whether a page/layout/loading file already resolves `localeParam`
 * from its route `params` — either via this package's own
 * `setLocaleAsync(params)` helper, or an inline `const { <localeParam> } =
 * await params`. Comments are stripped first (see
 * `dynamic_pages_check/detect_dynamic_usage.ts`'s `stripComments`) so a
 * mention in a comment or string doesn't count as real setup.
 */
export function detectLocaleParams(sourceText: string, localeParam: string): LocaleParamsDetectionResult {
    const code = stripComments(sourceText);
    const hasSetLocaleAsync = SET_LOCALE_ASYNC_CALL.test(code);
    const hasInlineDestructure = inlineDestructureRegex(localeParam).test(code);
    const hasSetLocaleCall = hasSetLocaleAsync || SET_LOCALE_CALL.test(code);
    // Only meaningful (and only checked) when there's no recognized inline
    // destructure yet — that's the one binding shape this scan itself would
    // introduce, so it's never a "conflict" with the fix it's about to make.
    const hasConflictingLocaleBinding = !hasInlineDestructure && declaredBindingNames(code).has(localeParam);
    const hasDestructuredParamsProp = DESTRUCTURED_PARAMS_PROP.test(code);
    const destructuredObject = findDestructuredObjectWithInlineType(code);
    // "No params key at all" — a bare `params` key already took the
    // `hasDestructuredParamsProp` path above, so this only needs to also
    // exclude an ALIASED `params: routeParams` key (still a `params` key,
    // just bound to a different local name) from counting as "absent".
    // `(?![\w$])` alone (no `:` in the exclusion) is enough here: unlike
    // `DESTRUCTURED_PARAMS_PROP`'s use of this same word elsewhere (which
    // must avoid matching `params` inside a TYPE annotation), `keys` is
    // only ever the destructure's own key list, where `params` followed by
    // `:` unambiguously means an alias, not a type.
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
