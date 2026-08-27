export const defaultStaleDeployPatterns = [
    'chunk',
    'failed to fetch',
    'loading css chunk',
    'connection closed',
    'rsc payload',
    'minified react error #412',
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
    if (!error)
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
