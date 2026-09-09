export const defaultStaleDeployPatterns = [
    'chunk',
    'dynamically imported module',
    'failed to fetch',
    'loading css chunk',
    'connection closed',
    'rsc payload',
    'minified react error #412',
    'minified react error #418',
    'minified react error #419',
    'minified react error #421',
    'minified react error #422',
    'minified react error #423',
    'minified react error #425',
    'minified react error #426',
    'an error occurred in the server components render',
    'server components render',
    'digest property is included on this error instance',
    'the above error occurred in a react component',
    'the connection to the page was unexpectedly closed',
    'readablestream',
    'readable stream',
    'uncaught exception: undefined',
    'uncaught undefined',
    'server action not found',
    'unrecognizedactionerror',
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
    let message = '';
    if (error instanceof Error) {
        if (error.name === 'ChunkLoadError' || error.name === 'UnrecognizedActionError')
            return true;
        message = (error.message || '').toLowerCase();
    }
    else if (typeof error === 'string') {
        message = error.toLowerCase();
    }
    else {
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
