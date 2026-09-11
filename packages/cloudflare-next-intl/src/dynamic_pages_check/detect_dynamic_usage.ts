/** One dynamic-API signal, with the 1-based source line its match starts on. */
export interface DynamicApiMatch {
    /** Human-readable name, e.g. `'cookies()'`, `'searchParams'`. */
    name: string;
    /** 1-based line number of the match's first character. */
    line: number;
}

export interface DynamicDetectionResult {
    hasExplicitDynamicExport: boolean;
    /** Human-readable names of each distinct dynamic-API signal found — e.g. `'cookies()'`, `'searchParams'`. Empty when the page looks static. */
    detectedDynamicApis: string[];
    /**
     * Same signals as `detectedDynamicApis`, each paired with the line its
     * first match starts on, so an unexpected `force-dynamic` can be traced
     * without a manual `grep`.
     */
    matches: DynamicApiMatch[];
}

/** 1-based line number of `index` within `sourceText` (count of `\n` before it, plus one). */
function lineOf(sourceText: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (sourceText.charCodeAt(i) === 10) line++;
    }
    return line;
}

/**
 * Blanks out `//` and `/* *\/` comments, keeping every other character
 * (including newlines) in place, so an index into the result still points
 * at the same line/column of `sourceText` — a match this scan finds only in
 * a comment (`// this used to call getAuthUser()`) is dead code, not a
 * dynamic-API call the render will ever make, and reporting its line
 * pointed a caller at documentation instead of the real call site (or, with
 * no real call anywhere else in the file, flagged a page for nothing that
 * runs). A `//` immediately after `:` is left alone — the overwhelmingly
 * common case that isn't a comment start is a URL (`https://…`), and this
 * scan has no real tokenizer to tell the rare genuine one apart from it.
 */
export function stripComments(sourceText: string): string {
    let out = '';
    for (let i = 0; i < sourceText.length; i++) {
        if (sourceText[i] === '/' && sourceText[i + 1] === '*') {
            const end = sourceText.indexOf('*/', i + 2);
            const commentEnd = end === -1 ? sourceText.length : end + 2;
            for (let j = i; j < commentEnd; j++) out += sourceText[j] === '\n' ? '\n' : ' ';
            i = commentEnd - 1;
            continue;
        }
        if (sourceText[i] === '/' && sourceText[i + 1] === '/' && sourceText[i - 1] !== ':') {
            let end = sourceText.indexOf('\n', i);
            if (end === -1) end = sourceText.length;
            out += ' '.repeat(end - i);
            i = end - 1;
            continue;
        }
        out += sourceText[i];
    }
    return out;
}

// Text-based heuristics, not a real parser — good enough to catch the
// overwhelmingly common cases (this package has no TypeScript-compiler-API
// dependency to spend on a precise one) and deliberately conservative: a
// false positive here just means a page keeps Next's default dynamic
// inference instead of gaining `force-static`, never the other way around.
// `getAuthUser()`/`useAuthUser()` are this package's own server-side auth
// helpers (`cloudflare-next-intl/getFirebaseAuthUser`,
// `.../useFirebaseAuthUser`) — both call Next's `cookies()` internally, so a
// call to either is itself a dynamic signal even though the literal text
// `cookies(` never appears at the call site. `withUserDb()`
// (`cloudflare-next-intl/db`) runs a per-signed-in-user, RLS-scoped query —
// when its caller passes no explicit `uid`, it resolves one via
// `getAuthUser()` internally (`db/context.ts`'s `resolveUserId`), the same
// text-invisible dependency, so it's flagged unconditionally rather than
// trying to detect whether a given call site happens to pass `uid` itself.
// `getTranslations()`/`useTranslations()` are handled separately below
// (`TRANSLATIONS_CALL_NO_LOCALE`) since whether they're cookie-dependent
// depends on whether the file calls `setLocale`/`setLocaleAsync` first — and,
// like `useAuthUser()` above, on whether the file is a Client Component: the
// client-hook variant (`client/hooks/client_hooks.ts`, resolved via the
// `cloudflare-next-intl/use` subpath's default condition in a `"use client"`
// file) reads the locale from React context set up by `IntlProvider`, never
// from a cookie, so it's not a dynamic signal there.
/** One `{ name, pattern }` dynamic-API check — the shape both the built-in list and `extraChecks` use. */
export interface DynamicApiCheck {
    /** Human-readable name this check reports as a signal, e.g. `'myCustomAuthHelper()'`. */
    name: string;
    /** Matched against the file's text with comments blanked out (see `stripComments`) — write it as if scanning plain code. */
    pattern: RegExp;
}

const DYNAMIC_API_CHECKS: DynamicApiCheck[] = [
    { name: 'cookies()', pattern: /\bcookies\s*\(/ },
    { name: 'headers()', pattern: /\bheaders\s*\(\s*\)/ },
    { name: 'unstable_noStore()', pattern: /\bunstable_noStore\s*\(/ },
    { name: 'connection()', pattern: /\bconnection\s*\(\s*\)/ },
    { name: 'cache: "no-store"', pattern: /cache:\s*['"]no-store['"]/ },
    { name: 'next: { revalidate: 0 }', pattern: /next:\s*\{\s*revalidate:\s*0\s*[,}]/ },
    { name: 'getAuthUser()', pattern: /\bgetAuthUser\s*\(/ },
    { name: 'withUserDb()', pattern: /\bwithUserDb\s*\(/ },
];

// `useAuthUser()` is ambiguous by name alone: `cloudflare-next-intl` exports
// it both as the server-side helper (wraps `cookies()`, resolved via the
// `react-server` package.json export condition) and as the client-side
// `AuthUserProvider`-context hook (`"use client"` only, never touches
// `cookies()`) — same identifier, same call syntax, different module
// depending purely on which condition the bundler resolves. A file's own
// `"use client"` directive is a reliable disambiguator: Next never applies
// the `react-server` condition inside a Client Component, so a `useAuthUser`
// call there can only be the client hook — checked separately from
// `DYNAMIC_API_CHECKS` so it can be skipped based on that directive.
const USE_AUTH_USER_CALL = /\buseAuthUser\s*\(/;

// `searchParams` is ambiguous the same way: a Server Component page/layout
// receives it as the dynamic-forcing `searchParams` prop (Next reads the URL
// query string to produce it, so any page destructuring it is inherently
// dynamic) — but that prop is never passed to a Client Component. There, the
// same identifier can only be a local binding for `next/navigation`'s
// `useSearchParams()` hook (as seen here, e.g. `const searchParams =
// useSearchParams();`), whose value is read on the client and carries no
// server-dynamic consequence of its own. Checked separately from
// `DYNAMIC_API_CHECKS` so it can be skipped based on the `"use client"`
// directive, same as `useAuthUser()` above.
const SEARCH_PARAMS_IDENTIFIER = /\bsearchParams\b/;

// `getTranslations(namespace)` / `useTranslations(namespace)` (both exported
// by `cloudflare-next-intl`) resolve their locale via `getLocale()` when no
// second `locale` argument is passed — which, absent an explicit
// `setLocale`/`setLocaleAsync` call earlier in the same file, falls through
// to reading the `NEXT_LOCALE`-style cookie (see
// `server/functions/server.ts`'s `iGetLocale`). A page that never resolves
// its own locale from route params is therefore cookie-dependent even
// though the literal text `cookies(` never appears in it. Detected only
// when: (a) the call has a single argument (no explicit `locale`), and (b)
// no `setLocale(`/`setLocaleAsync(` call appears anywhere earlier in the
// file — a page that resolves locale from params first is genuinely
// static.
const TRANSLATIONS_CALL_NO_LOCALE = /\b(?:getTranslations|useTranslations)\s*\(\s*(?:['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*\)/;
const SET_LOCALE_CALL = /\bsetLocale(?:Async)?\s*\(/;

/**
 * Whether `sourceText` calls `setLocale(`/`setLocaleAsync(` anywhere in its
 * own text. Exported so `traceDynamicUsage` can check the entry page file
 * specifically: `setLocale`'s cache is a plain module-level variable (see
 * `general/cache_variables.ts`), not per-file state, so once the entry page
 * calls it — always before React renders any child Server Component, since
 * the call sits inside the page's own async function body, which must finish
 * running before it returns the JSX tree that references those children —
 * every descendant's own `getTranslations()`/`useTranslations()` call
 * resolves from that already-cached locale too, never from a cookie, even
 * though each descendant file's own text has no `setLocale` call to show for
 * it.
 */
export function hasSetLocaleCall(sourceText: string): boolean {
    return SET_LOCALE_CALL.test(stripComments(sourceText));
}

/**
 * Matches a leading `"use client"` directive. Exported so
 * `collectReachableFiles` can stop tracing imports past a Client Component
 * boundary — anything a client file imports (a `"use server"` action bound
 * to an event handler included) only ever runs later via an RPC the browser
 * triggers, never during the server render that decides whether the PAGE
 * itself is static or dynamic. `detectDynamicUsage` still runs on the client
 * file's own text, since a client file can't itself call a server-only
 * dynamic API.
 */
export const USE_CLIENT_DIRECTIVE = /^(?:\s*['"]use \w[\w-]*['"]\s*;?\s*)*['"]use client['"]\s*;?/;

const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;

/**
 * @param extraChecks Additional `{ name, pattern }` checks to run alongside
 * the built-in list — for a project's own dynamic-wrapping helper this text
 * scan has no way to know about (its own `getAuthUser()`-style function, a
 * custom cache-busting call, ...). Each pattern is matched against the same
 * comment-stripped text the built-ins use; see `stripComments`.
 */
export function detectDynamicUsage(sourceText: string, extraChecks: readonly DynamicApiCheck[] = []): DynamicDetectionResult {
    const code = stripComments(sourceText);
    const matches: DynamicApiMatch[] = [];
    for (const { name, pattern } of [...DYNAMIC_API_CHECKS, ...extraChecks]) {
        // A caller-supplied `extraChecks` pattern might carry a `g`/`y` flag,
        // which makes `.exec` stateful (`lastIndex`) across calls on the same
        // RegExp object — reset it so one file's scan can't skip a match
        // because a PREVIOUS file happened to leave `lastIndex` past it.
        pattern.lastIndex = 0;
        const found = pattern.exec(code);
        if (found !== null) matches.push({ name, line: lineOf(sourceText, found.index) });
    }
    if (!USE_CLIENT_DIRECTIVE.test(sourceText)) {
        const found = USE_AUTH_USER_CALL.exec(code);
        if (found !== null) matches.push({ name: 'useAuthUser()', line: lineOf(sourceText, found.index) });
    }
    if (!USE_CLIENT_DIRECTIVE.test(sourceText)) {
        const found = SEARCH_PARAMS_IDENTIFIER.exec(code);
        if (found !== null) matches.push({ name: 'searchParams', line: lineOf(sourceText, found.index) });
    }
    if (!USE_CLIENT_DIRECTIVE.test(sourceText) && !SET_LOCALE_CALL.test(code)) {
        const found = TRANSLATIONS_CALL_NO_LOCALE.exec(code);
        if (found !== null) matches.push({ name: 'getTranslations()/useTranslations() (cookie-derived locale)', line: lineOf(sourceText, found.index) });
    }
    return {
        hasExplicitDynamicExport: EXPLICIT_DYNAMIC_EXPORT.test(code),
        detectedDynamicApis: matches.map((m) => m.name),
        matches,
    };
}

const EXPLICIT_DYNAMIC_EXPORT_VALUE = /export\s+const\s+dynamic\s*=\s*['"]([^'"]+)['"]/;

/**
 * Reads the literal string value of an explicit `export const dynamic =
 * '...'`, or `null` when there isn't one, or its value isn't one of Next's
 * four recognized literals (`force-static`/`force-dynamic`/`auto`/`error`)
 * — e.g. a non-literal expression this text scan can't evaluate.
 */
export function readExplicitDynamicValue(sourceText: string): 'force-static' | 'force-dynamic' | 'auto' | 'error' | null {
    const match = EXPLICIT_DYNAMIC_EXPORT_VALUE.exec(stripComments(sourceText));
    if (match === null) return null;
    const value = match[1];
    if (value === 'force-static' || value === 'force-dynamic' || value === 'auto' || value === 'error') return value;
    return null;
}
