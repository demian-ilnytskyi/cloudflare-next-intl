export const defaultStaleDeployPatterns: readonly string[] = [
    'chunk',
    'dynamically imported module',
    'failed to fetch',
    'loading css chunk',
    'server action not found',
    'unrecognizedactionerror',
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
    if (error === undefined) return true;
    if (!error) return false;

    let message = '';
    if (error instanceof Error) {
        if (error.name === 'ChunkLoadError' || error.name === 'UnrecognizedActionError') return true;
        message = (error.message || '').toLowerCase();
    } else if (typeof error === 'string') {
        message = error.toLowerCase();
    } else {
        return false;
    }

    const list = patterns ? patterns.map((p) => p.toLowerCase()) : activeLowercasedPatterns;
    for (const pattern of list) {
        if (message.includes(pattern)) {
            return true;
        }
    }
    return false;
}
