/**
 * Whether `path` is exempt from auth redirects under `whiteListPaths`.
 * Matches an entry exactly, OR as a path-segment prefix (`/bonds` also
 * covers `/bonds/some-slug`, but NOT `/bonds-extra`) — a plain
 * `startsWith` would let a differently-named sibling route slip through
 * whenever one route's name happens to prefix another's.
 */
export default function isWhitelisted(path, whiteListPaths) {
    if (!whiteListPaths)
        return false;
    return whiteListPaths.some((entry) => path === entry || path.startsWith(`${entry}/`));
}
