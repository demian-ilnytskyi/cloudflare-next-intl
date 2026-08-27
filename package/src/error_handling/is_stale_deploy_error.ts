export const defaultStaleDeployPatterns: readonly string[] = [
    'chunk',
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
    error: Error,
    patterns?: readonly string[],
): boolean {
    if (!error) return false;

    if (error.name === 'ChunkLoadError') return true;

    const message = (error.message || '').toLowerCase();
    const list = patterns ? patterns.map((p) => p.toLowerCase()) : activeLowercasedPatterns;
    for (let i = 0; i < list.length; i++) {
        if (message.includes(list[i])) {
            return true;
        }
    }
    return false;
}
