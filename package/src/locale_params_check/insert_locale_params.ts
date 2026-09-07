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

/**
 * Matches a non-`async` `export default function Name(` — the exact
 * function keyword `wrapSyncDefaultExportWithParams` rewrites. Deliberately
 * excludes `async` (an already-async function is handled by the ordinary
 * `insertLocaleParamsSignature`/`addParamsPropToExistingDestructure`/
 * `ensureLocaleInParamsType` + `insertLocaleParamsBody` combination, which
 * can safely add its own `await` in place).
 */
const SYNC_DEFAULT_EXPORT_FUNCTION = /export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/;

/**
 * Finds a name derived from `baseName` (`${baseName}ContentCloudflareNextIntl`,
 * then `${baseName}ContentCloudflareNextIntl2`, `...3`, ...) that doesn't
 * already appear as a word anywhere in `sourceText` — so the generated
 * inner component can never collide with an identifier the file already
 * uses (an import, another local component, a variable). The
 * `CloudflareNextIntl` suffix (not just `Content`, a name plenty of
 * projects already have their own component or prop called) makes a first-
 * try collision unlikely before the numeric fallback ever has to kick in.
 */
function findUnusedContentName(sourceText: string, baseName: string): string {
    let candidate = `${baseName}ContentCloudflareNextIntl`;
    let suffix = 2;
    while (new RegExp(`\\b${candidate}\\b`).test(sourceText)) {
        candidate = `${baseName}ContentCloudflareNextIntl${suffix}`;
        suffix += 1;
    }
    return candidate;
}

const DEFAULT_EXPORT_FUNCTION_OPEN_PAREN = /export\s+default\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;

/**
 * The default-exported function's own parameter-list text, `(...)`
 * INCLUDING the parens — e.g. `()`, `({ ownerId }: { ownerId: string })`,
 * or `({ params }: { params: Promise<{ ownerId: string }> })`. Brace-depth
 * aware past the open paren so a destructured object type doesn't get
 * mistaken for the closing paren.
 */
function findParamListSpan(sourceText: string): { start: number; end: number } | null {
    const openParenMatch = DEFAULT_EXPORT_FUNCTION_OPEN_PAREN.exec(sourceText);
    if (openParenMatch === null) return null;
    const start = openParenMatch.index + openParenMatch[0].length - 1;
    let depth = 0;
    for (let i = start; i < sourceText.length; i++) {
        if (sourceText[i] === '(') depth++;
        else if (sourceText[i] === ')') {
            depth--;
            if (depth === 0) return { start, end: i + 1 };
        }
    }
    return null;
}

/**
 * Splits a destructured object pattern's inner text (between its `{` and
 * `}`, e.g. `'ownerId, page = 1'` or `'params'`) into its top-level key
 * names — depth-aware so a default value containing `,` or `{}` (`page =
 * {}`) doesn't get split as if it were another key, and taking the bound
 * name before any `:` alias or `=` default. Returns `[]` for an empty or
 * unparseable pattern (e.g. a rest element `...rest`, which this scan
 * doesn't forward) rather than guessing.
 */
function destructuredKeyNames(inner: string): string[] {
    const names: string[] = [];
    let depth = 0;
    let start = 0;
    const parts: string[] = [];
    for (let i = 0; i <= inner.length; i++) {
        const char = inner[i];
        if (i === inner.length || (char === ',' && depth === 0)) {
            parts.push(inner.slice(start, i));
            start = i + 1;
            continue;
        }
        if (char === '{' || char === '(' || char === '[') depth++;
        else if (char === '}' || char === ')' || char === ']') depth--;
    }
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === '' || trimmed.startsWith('...')) continue;
        const key = trimmed.split(':')[0]!.split('=')[0]!.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(key)) names.push(key);
    }
    return names;
}

/**
 * Rewrites a non-`async` `export default function Name(...) { ... }` —
 * whatever its own parameter list is: none, an unrelated destructured prop
 * (`{ ownerId }: { ownerId: string }`), or an existing `{ params }` already
 * typed for a different key — into a plain (unexported, still sync)
 * `function NameContentCloudflareNextIntl(...) { ... }` with that SAME parameter list and
 * body byte-for-byte untouched, followed by a NEW `export default async
 * function Name({ ...originalKeys, params }: { ...originalType; params:
 * Promise<{ <localeParam>: Language }> }) { const { <localeParam> } =
 * await params; setLocale(<localeParam>); return <NameContentCloudflareNextIntl
 * ownerId={ownerId} ... />; }` — i.e. the wrapper takes on whatever props
 * the original function had (plus `params`) purely to forward them
 * unchanged by name, never reading them itself.
 *
 * Why a wrapper instead of making the original function `async` in place
 * (what the ordinary in-place path does for an already-`async` function):
 * a sync Server Component can call React's synchronous `use()`-based
 * helpers (this package's own `useTranslations`/`useLocale` from the
 * `cloudflare-next-intl/use` subpath's `react-server` condition, or a
 * project's own `use()`-based helper) in ways that assume the enclosing
 * component's own render is still synchronous relative to its caller;
 * forcing `async` onto a function this scan didn't write, just to host one
 * `await params`, risks changing behavior this text-based scan cannot fully
 * verify is safe. Splitting confines the new `await` to a wrapper that does
 * nothing else, leaving the original function — and everything it does —
 * exactly as written, just renamed and no longer the default export.
 *
 * The generated inner name is `${OriginalName}ContentCloudflareNextIntl` (see
 * `findUnusedContentName` for the collision-avoidance suffix).
 *
 * @param existingParamsType When the original signature already
 * destructures `{ params }` (reusing an existing `params: Promise<{ ... }>`
 * prop for an unrelated key, e.g. `Promise<{ ownerId: string }>`), pass
 * that inner type body (`'ownerId: string'`) so the wrapper's own `params`
 * type is widened to include both keys — `<localeParam>` is otherwise
 * indistinguishable from a second, colliding `params` prop. `Content` keeps
 * its OWN `{ params }` prop unchanged (still the same `Promise`, still
 * typed for only the original key — a `Promise` can be `await`ed more than
 * once, so re-forwarding the same one the wrapper itself just awaited is
 * safe) rather than being handed a resolved value for it, since the
 * wrapper doesn't know what `Content`'s own body does with the rest of
 * that promise, only that `<localeParam>` isn't part of it yet. `undefined`
 * for every other shape (no existing `params` prop to merge with).
 *
 * Returns the source unchanged if no non-`async` default-exported function
 * is found, or if its parameter list isn't a plain top-level destructure
 * this scan can safely re-derive forwarding props from.
 */
export function wrapSyncDefaultExportWithParams(
    sourceText: string,
    localeParam: string,
    existingParamsType?: string,
): string {
    const nameMatch = SYNC_DEFAULT_EXPORT_FUNCTION.exec(sourceText);
    if (nameMatch === null) return sourceText;
    const name = nameMatch[1]!;

    const paramList = findParamListSpan(sourceText);
    if (paramList === null) return sourceText;
    const bodyStart = findFunctionBodyStart(sourceText);
    if (bodyStart === null) return sourceText;
    const bodyEnd = findMatchingBraceEnd(sourceText, bodyStart - 1);
    if (bodyEnd === null) return sourceText;

    const contentName = findUnusedContentName(sourceText, name);
    const originalParams = sourceText.slice(paramList.start, paramList.end);
    const originalBody = sourceText.slice(bodyStart, bodyEnd - 1);

    // The keys the wrapper needs to accept-and-forward: every top-level
    // destructured key from the original signature — including `params`
    // itself when reusing an existing `{ params }` prop, since `Content`
    // keeps its own copy of that same `Promise` (see the
    // `existingParamsType` doc above) — except when the pattern isn't a
    // plain object destructure this scan recognizes at all (an aliased
    // single non-destructured argument, e.g. `(props)`). Brace-depth aware
    // (via `findMatchingBraceEnd`, not a greedy regex) so a following type
    // annotation's own `{ ... }` — which can itself contain `,`/`}` inside
    // a nested type — is never mistaken for part of the destructure.
    let forwardKeys: string[] = [];
    // The plain inline type text for each forwarded key (e.g. `'test:
    // string'`), taken from the SAME `: { ... }` type annotation the
    // destructure came from — needed so the wrapper's own signature stays
    // fully typed (`{ test, params }: { test: string; params: ... }`)
    // rather than silently dropping every forwarded key's type, which
    // would leave `test` an implicit-`any`/type error in the wrapper. Left
    // `[]` (falls back to a `params`-only type) for a destructure with no
    // following plain inline object type this scan can parse (`Readonly<{
    // ... }>`, a named type, no annotation at all) — the same "don't guess"
    // rule `findDestructuredObjectWithInlineType` documents.
    let forwardKeyTypes: string[] = [];
    if (originalParams !== '()') {
        const openBrace = originalParams.indexOf('{');
        if (openBrace === -1) return sourceText;
        const keysEnd = findMatchingBraceEnd(originalParams, openBrace);
        if (keysEnd === null) return sourceText;
        forwardKeys = destructuredKeyNames(originalParams.slice(openBrace + 1, keysEnd - 1));

        let j = keysEnd;
        while (j < originalParams.length && /\s/.test(originalParams[j]!)) j++;
        if (originalParams[j] === ':') {
            j++;
            while (j < originalParams.length && /\s/.test(originalParams[j]!)) j++;
            if (originalParams[j] === '{') {
                const typeEnd = findMatchingBraceEnd(originalParams, j);
                if (typeEnd !== null) {
                    const typeBody = originalParams.slice(j + 1, typeEnd - 1).trim();
                    forwardKeyTypes = typeBody === '' ? [] : typeBody.split(';').map((s) => s.trim()).filter(Boolean);
                }
            }
        }
    }
    // `params` is always in the wrapper's OWN signature (it's the thing
    // being resolved), so it's never duplicated into the forwarded-props
    // list even when it's also one of Content's original keys.
    const otherForwardKeys = forwardKeys.filter((key) => key !== 'params');
    const otherForwardKeyTypes = forwardKeyTypes.filter((type) => !/^params\s*:/.test(type));

    const contentFunction = `function ${contentName}${originalParams} {${originalBody}}`;
    // Merge with an existing type rather than blindly appending — a file
    // whose `{ params }` prop is already typed for `<localeParam>` itself
    // (e.g. the reuse-path source already had `Promise<{ locale: Language
    // }>` before this scan touched it) would otherwise end up with the
    // same key listed twice.
    const alreadyHasLocaleParam = existingParamsType !== undefined && new RegExp(`\\b${localeParam}\\b`).test(existingParamsType);
    const wrapperParamsType = existingParamsType === undefined
        ? `${localeParam}: Language`
        : alreadyHasLocaleParam
            ? existingParamsType
            : `${existingParamsType.replace(/;?\s*$/, '')}; ${localeParam}: Language`;
    const wrapperSignature = otherForwardKeys.length === 0 ? `{ params }` : `{ ${otherForwardKeys.join(', ')}, params }`;
    const forwardedJsx = forwardKeys.map((key) => (key === 'params' ? ` params={params}` : ` ${key}={${key}}`)).join('');
    // Each forwarded key needs its own line in the wrapper's type too — a
    // wrapper signature that destructures `test` but only types `params`
    // is a `tsc` error (`Property 'test' does not exist...`) even though
    // vinext/esbuild's own build (a JS transform, not a type-checker) lets
    // it through silently.
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
 * The inner type body of the FIRST `params: Promise<{ ... }>` found in the
 * file (e.g. `'ownerId: string'` for `Promise<{ ownerId: string }>`), or
 * `null` if no such type is present — the same match `ensureLocaleInParamsType`
 * widens in place, exposed standalone so `wrapSyncDefaultExportWithParams`'s
 * caller can pass it through as `existingParamsType` without re-deriving it.
 */
export function extractParamsPromiseType(sourceText: string): string | null {
    return PARAMS_PROMISE_TYPE.exec(sourceText)?.[1]?.trim() ?? null;
}

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
