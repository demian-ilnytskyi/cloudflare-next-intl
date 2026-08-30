export default function isWhitelisted(path, whiteListPaths) {
    if (!whiteListPaths)
        return false;
    return whiteListPaths.some((entry) => path === entry || path.startsWith(`${entry}/`));
}
