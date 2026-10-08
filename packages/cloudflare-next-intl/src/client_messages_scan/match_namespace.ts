export function matchesNamespacePattern(ns: string, pattern: string): boolean {
    return pattern.endsWith("*") ? ns.startsWith(pattern.slice(0, -1)) : ns === pattern;
}
