import { relative, sep } from 'node:path';

/** Splits `camelCase`/`PascalCase`/`kebab-case`/`snake_case` into separate words. */
function splitWords(segment: string): string[] {
    return segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[-_\s]+/)
        .filter((word) => word.length > 0);
}

function titleCaseWords(words: string[]): string {
    return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

/**
 * A short, readable name for the page at `file` — e.g. `accept-invite/page.tsx`
 * becomes `"Accept Invite"`, `results/[id]/page.tsx` becomes `"Results (:id)"`,
 * and a route with no literal segment at all (`[locale]/page.tsx`, an app's
 * root) becomes `"Home"`.
 *
 * Walks the path from the file up to `appDir`, skipping the filename, any
 * route group (`(name)`), and any dynamic segment (`[name]`/`[...name]`) —
 * the last segment left is the page's own literal name. If a dynamic
 * segment sits BELOW that literal one (`results/[id]`), it's kept as a
 * `(:id)` suffix so sibling dynamic routes (`results` vs `results/[id]`)
 * don't collide under the same label.
 */
export function derivePageLabel(appDir: string, file: string): string {
    const rel = relative(appDir, file);
    const segments = rel.split(sep).filter((s) => s.length > 0);
    segments.pop(); // drop the filename (page.tsx, route.ts, ...)

    let literal: string | null = null;
    let dynamicSuffix: string | null = null;
    for (const segment of segments) {
        const dynamicMatch = /^\[+\.{0,3}([^\]]+)\]+$/.exec(segment);
        if (dynamicMatch) {
            if (literal !== null) dynamicSuffix = dynamicMatch[1]!;
            continue;
        }
        if (/^\(.+\)$/.test(segment)) continue; // route group: invisible in the URL
        literal = segment;
        dynamicSuffix = null; // a later literal segment supersedes an earlier dynamic one
    }

    if (literal === null) return 'Home';
    const label = titleCaseWords(splitWords(literal));
    return dynamicSuffix ? `${label} (:${dynamicSuffix})` : label;
}

/**
 * The URL route `file` serves, App-Router style — e.g.
 * `[locale]/(app)/property-profile/[ownerId]/page.tsx` becomes
 * `"/:locale/property-profile/:ownerId"`. Route groups (`(name)`) are
 * dropped (invisible in the URL); dynamic segments (`[name]`, `[...name]`,
 * `[[...name]]`) become `:name`/`:...name`. Unlike `derivePageLabel`, every
 * segment is kept, in order — this is the address, not a human name for it.
 */
export function deriveRoute(appDir: string, file: string): string {
    const rel = relative(appDir, file);
    const segments = rel.split(sep).filter((s) => s.length > 0);
    segments.pop(); // drop the filename (page.tsx, route.ts, ...)

    const urlSegments = segments
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .map((segment) => {
            const dynamicMatch = /^\[+(\.{3})?([^\]]+)\]+$/.exec(segment);
            if (!dynamicMatch) return segment;
            return `:${dynamicMatch[1] ? '...' : ''}${dynamicMatch[2]}`;
        });

    return urlSegments.length > 0 ? `/${urlSegments.join('/')}` : '/';
}

/** A `route.*` handler is always a server function (an API endpoint), never a prerenderable page — distinct from `page.*`'s Static/Dynamic distinction. */
export function isApiRoute(file: string): boolean {
    return /(^|[\\/])route\.(ts|js)$/.test(file);
}

export type PageLabelStyle = 'title' | 'path';

/** Resolves the configured page-label style/function into a `(file) => string`. */
export function makePageLabeler(
    appDir: string,
    style: PageLabelStyle | ((file: string, appDir: string) => string) | undefined,
    displayPath: (file: string) => string,
): (file: string) => string {
    if (typeof style === 'function') return (file) => style(file, appDir);
    if (style === 'path') return displayPath;
    return (file) => derivePageLabel(appDir, file);
}
