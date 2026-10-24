import { extractLowercaseMessage, messageMatchesAnyPattern } from './match_error_message.js';

export const defaultStaleDeployPatterns: readonly string[] = [
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
    // Firefox's necko wording when an RSC stream read is aborted by the
    // document navigating away mid-fetch — confirmed via a live
    // reproduction and a direct read of the errors board, not a guess. No
    // digest, and routinely no stack at all (an internal engine throw, not
    // user code). `use_stale_deploy_recovery.ts` recognizes this exact
    // wording separately too, to skip the RELOAD this match would otherwise
    // trigger: reloading here would re-fetch the page the visitor is
    // already leaving, not the one a stale deploy actually broke.
    'error in input stream',
    'uncaught exception: undefined',
    'uncaught undefined',
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
    // A stale build can leave the caught value itself missing — e.g. an
    // aborted RSC stream reaching a client component as `undefined` rather
    // than a real Error (seen as "Global Error undefined ... The above error
    // occurred in a React component" in the console, with no message to
    // pattern-match on). Treat exactly `undefined` as stale-deploy; a normal
    // thrown error is never `undefined`.
    if (error === undefined) return true;
    if (!error) return false;
    if (error instanceof Error && (error.name === 'ChunkLoadError' || error.name === 'UnrecognizedActionError')) return true;

    const message = extractLowercaseMessage(error);
    if (message === null) return false;

    const list = patterns ? patterns.map((p) => p.toLowerCase()) : activeLowercasedPatterns;
    return messageMatchesAnyPattern(message, list);
}
