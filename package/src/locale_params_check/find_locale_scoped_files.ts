import { sep } from 'node:path';
import { findPageFiles } from '../dynamic_pages_check/find_page_files.js';

const LOCALE_SCOPED_FILE_NAMES = new Set([
    'page.tsx', 'page.ts', 'page.jsx', 'page.js',
    'layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js',
    'loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js',
]);

/**
 * `findPageFiles` (`route.*`, `page.*`, `loading.*`) plus `layout.*`,
 * restricted to files whose path has `[<localeParam>]` as its first
 * segment under `appDir` — i.e. genuinely locale-scoped routes, not an
 * unrelated dynamic segment sharing the same name deeper in the tree.
 */
export function findLocaleScopedFiles(appDir: string, localeParam: string): string[] {
    const prefix = `${appDir}${sep}[${localeParam}]${sep}`;
    return findPageFiles(appDir).filter((file) => {
        const name = file.slice(file.lastIndexOf(sep) + 1);
        return LOCALE_SCOPED_FILE_NAMES.has(name) && file.startsWith(prefix);
    });
}
