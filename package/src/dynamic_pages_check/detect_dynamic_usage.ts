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
const DYNAMIC_API_CHECKS: { name: string; pattern: RegExp }[] = [
    { name: 'cookies()', pattern: /\bcookies\s*\(/ },
    { name: 'headers()', pattern: /\bheaders\s*\(\s*\)/ },
    { name: 'searchParams', pattern: /\bsearchParams\b/ },
    { name: 'unstable_noStore()', pattern: /\bunstable_noStore\s*\(/ },
    { name: 'connection()', pattern: /\bconnection\s*\(\s*\)/ },
    { name: 'cache: "no-store"', pattern: /cache:\s*['"]no-store['"]/ },
    { name: 'next: { revalidate: 0 }', pattern: /next:\s*\{\s*revalidate:\s*0\s*[,}]/ },
];

const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;

export function detectDynamicUsage(sourceText: string): DynamicDetectionResult {
    return {
        hasExplicitDynamicExport: EXPLICIT_DYNAMIC_EXPORT.test(sourceText),
        detectedDynamicApis: DYNAMIC_API_CHECKS.filter(({ pattern }) => pattern.test(sourceText)).map(({ name }) => name),
    };
}
