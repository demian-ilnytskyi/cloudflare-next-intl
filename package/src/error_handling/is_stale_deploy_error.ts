export const defaultStaleDeployPatterns: readonly string[] = [
    'chunk',
    'dynamically imported module',
    'failed to fetch',
    'loading css chunk',
    'connection closed',
    'rsc payload',
    'minified react error #412',
    'the above error occurred in a react component',
    'the connection to the page was unexpectedly closed',
];

let activePatterns: readonly string[] = defaultStaleDeployPatterns;
let activeLowercasedPatterns: readonly string[] = defaultStaleDeployPatterns.map((p) => p.toLowerCase());

export function setStaleDeployPatterns(patterns: readonly string[]): void {
    activePatterns = patterns;
    activeLowercasedPatterns = patterns.map((p) => p.toLowerCase());
}

export function getStaleDeployPatterns(): readonly string[] {
    return activePatterns;
}

export default function isStaleDeployError(
    error: unknown,
    patterns?: readonly string[],
): boolean {
    // A stale build can leave the caught value itself missing — e.g. an
    // aborted RSC stream reaching a client component as `undefined` rather
    // than a real Error (seen as "Global Error undefined ... The above error
    // occurred in a React component" in the console, with no message to
    // pattern-match on). Treat exactly `undefined` as stale-deploy; a normal
    // thrown error is never `undefined`.
    if (error === undefined) return true;
    if (!error) return false;
    if (!(error instanceof Error)) return false;

    if (error.name === 'ChunkLoadError') return true;

    const message = (error.message || '').toLowerCase();
    const list = patterns ? patterns.map((p) => p.toLowerCase()) : activeLowercasedPatterns;
    for (const pattern of list) {
        if (message.includes(pattern)) {
            return true;
        }
    }
    return false;
}
