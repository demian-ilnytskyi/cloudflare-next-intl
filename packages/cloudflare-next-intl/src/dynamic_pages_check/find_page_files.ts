import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_FILE_NAMES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.ts', 'route.js', 'loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']);

/** Recursively finds every App Router `page.*`/`route.*`/`loading.*` file under `appDir`, skipping `node_modules` and any dot-directory (`.next`, `.git`, ...). Returns `[]` for a directory that doesn't exist rather than throwing. */
export function findPageFiles(appDir: string): string[] {
    let entries;
    try {
        entries = readdirSync(appDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const files: string[] = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            files.push(...findPageFiles(join(appDir, entry.name)));
        } else if (PAGE_FILE_NAMES.has(entry.name)) {
            files.push(join(appDir, entry.name));
        }
    }
    return files;
}
