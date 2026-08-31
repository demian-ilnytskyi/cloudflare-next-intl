/**
 * Whether `path` is exempt from auth redirects under `whiteListPaths`.
 * Matches an entry exactly, OR as a path-segment prefix (`/bonds` also
 * covers `/bonds/some-slug`, but NOT `/bonds-extra`) — a plain
 * `startsWith` would let a differently-named sibling route slip through
 * whenever one route's name happens to prefix another's.
 */
export default function isWhitelisted(path: string, whiteListPaths: readonly string[] | undefined): boolean {
    if (!whiteListPaths) return false;
    // `path.startsWith(entry) && path.charCodeAt(entry.length) === 47` (47 = '/')
    // is equivalent to `path.startsWith(`${entry}/`)` but never allocates a new
    // string per entry — this runs on every request whose path doesn't exactly
    // match an early entry, i.e. most requests through the middleware.
    return whiteListPaths.some((entry) => path === entry || (path.startsWith(entry) && path.charCodeAt(entry.length) === 47));
}
