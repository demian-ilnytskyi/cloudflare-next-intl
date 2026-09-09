import { sep } from 'node:path';
import { findPageFiles } from '../dynamic_pages_check/find_page_files.js';
const LOCALE_SCOPED_FILE_NAMES = new Set([
    'page.tsx', 'page.ts', 'page.jsx', 'page.js',
    'layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js',
    'loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js',
]);
export function findLocaleScopedFiles(appDir, localeParam) {
    const prefix = `${appDir}${sep}[${localeParam}]${sep}`;
    return findPageFiles(appDir).filter((file) => {
        const name = file.slice(file.lastIndexOf(sep) + 1);
        return LOCALE_SCOPED_FILE_NAMES.has(name) && file.startsWith(prefix);
    });
}
