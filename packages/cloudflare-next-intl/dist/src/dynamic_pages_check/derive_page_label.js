import { relative, sep } from 'node:path';
function splitWords(segment) {
    return segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[-_\s]+/)
        .filter((word) => word.length > 0);
}
function titleCaseWords(words) {
    return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}
export function derivePageLabel(appDir, file) {
    const rel = relative(appDir, file);
    const segments = rel.split(sep).filter((s) => s.length > 0);
    segments.pop();
    let literal = null;
    let dynamicSuffix = null;
    for (const segment of segments) {
        const dynamicMatch = /^\[+\.{0,3}([^\]]+)\]+$/.exec(segment);
        if (dynamicMatch) {
            if (literal !== null)
                dynamicSuffix = dynamicMatch[1];
            continue;
        }
        if (/^\(.+\)$/.test(segment))
            continue;
        literal = segment;
        dynamicSuffix = null;
    }
    if (literal === null)
        return 'Home';
    const label = titleCaseWords(splitWords(literal));
    return dynamicSuffix ? `${label} (:${dynamicSuffix})` : label;
}
export function deriveRoute(appDir, file) {
    const rel = relative(appDir, file);
    const segments = rel.split(sep).filter((s) => s.length > 0);
    segments.pop();
    const urlSegments = segments
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .map((segment) => {
        const dynamicMatch = /^\[+(\.{3})?([^\]]+)\]+$/.exec(segment);
        if (!dynamicMatch)
            return segment;
        return `:${dynamicMatch[1] ? '...' : ''}${dynamicMatch[2]}`;
    });
    return urlSegments.length > 0 ? `/${urlSegments.join('/')}` : '/';
}
export function isApiRoute(file) {
    return /(^|[\\/])route\.(ts|js)$/.test(file);
}
export function makePageLabeler(appDir, style, displayPath) {
    if (typeof style === 'function')
        return (file) => style(file, appDir);
    if (style === 'path')
        return displayPath;
    return (file) => derivePageLabel(appDir, file);
}
