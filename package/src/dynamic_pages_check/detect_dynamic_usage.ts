export interface DynamicDetectionResult {
    hasExplicitDynamicExport: boolean;
    /** Human-readable names of each distinct dynamic-API signal found — e.g. `'cookies()'`, `'searchParams'`. Empty when the page looks static. */
    detectedDynamicApis: string[];
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
const DYNAMIC_API_CHECKS: { name: string; pattern: RegExp }[] = [
    { name: 'cookies()', pattern: /\bcookies\s*\(/ },
    { name: 'headers()', pattern: /\bheaders\s*\(\s*\)/ },
    { name: 'searchParams', pattern: /\bsearchParams\b/ },
    { name: 'unstable_noStore()', pattern: /\bunstable_noStore\s*\(/ },
    { name: 'connection()', pattern: /\bconnection\s*\(\s*\)/ },
    { name: 'cache: "no-store"', pattern: /cache:\s*['"]no-store['"]/ },
    { name: 'next: { revalidate: 0 }', pattern: /next:\s*\{\s*revalidate:\s*0\s*[,}]/ },
    { name: 'getAuthUser()', pattern: /\bgetAuthUser\s*\(/ },
    { name: 'useAuthUser()', pattern: /\buseAuthUser\s*\(/ },
    { name: 'withUserDb()', pattern: /\bwithUserDb\s*\(/ },
];

const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;

export function detectDynamicUsage(sourceText: string): DynamicDetectionResult {
    return {
        hasExplicitDynamicExport: EXPLICIT_DYNAMIC_EXPORT.test(sourceText),
        detectedDynamicApis: DYNAMIC_API_CHECKS.filter(({ pattern }) => pattern.test(sourceText)).map(({ name }) => name),
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
    const match = EXPLICIT_DYNAMIC_EXPORT_VALUE.exec(sourceText);
    if (match === null) return null;
    const value = match[1];
    if (value === 'force-static' || value === 'force-dynamic' || value === 'auto' || value === 'error') return value;
    return null;
}
