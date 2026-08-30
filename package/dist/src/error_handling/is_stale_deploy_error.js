export const defaultStaleDeployPatterns = [
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
let activePatterns = defaultStaleDeployPatterns;
let activeLowercasedPatterns = defaultStaleDeployPatterns.map((p) => p.toLowerCase());
export function setStaleDeployPatterns(patterns) {
    activePatterns = patterns;
    activeLowercasedPatterns = patterns.map((p) => p.toLowerCase());
}
export function getStaleDeployPatterns() {
    return activePatterns;
}
export default function isStaleDeployError(error, patterns) {
    if (error === undefined)
        return true;
    if (!error)
        return false;
    if (!(error instanceof Error))
        return false;
    if (error.name === 'ChunkLoadError')
        return true;
    const message = (error.message || '').toLowerCase();
    const list = patterns ? patterns.map((p) => p.toLowerCase()) : activeLowercasedPatterns;
    for (let i = 0; i < list.length; i++) {
        if (message.includes(list[i])) {
            return true;
        }
    }
    return false;
}
