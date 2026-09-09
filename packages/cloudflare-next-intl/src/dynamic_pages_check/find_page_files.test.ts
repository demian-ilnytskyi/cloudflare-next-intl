import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPageFiles } from './find_page_files.js';

describe('findPageFiles', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'cfni-find-page-files-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('finds page.tsx and route.ts at any depth', () => {
        mkdirSync(join(dir, 'errors', '[id]'), { recursive: true });
        writeFileSync(join(dir, 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', '[id]', 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', 'route.ts'), '');
        writeFileSync(join(dir, 'errors', 'error_row.tsx'), ''); // not a page/route — must be excluded

        const files = findPageFiles(dir).map((f) => f.replace(dir, ''));
        expect(files.sort()).toEqual([
            '/errors/[id]/page.tsx',
            '/errors/page.tsx',
            '/errors/route.ts',
            '/page.tsx',
        ].sort());
    });

    it('skips node_modules and dot-directories', () => {
        mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
        mkdirSync(join(dir, '.next'), { recursive: true });
        writeFileSync(join(dir, 'node_modules', 'x', 'page.tsx'), '');
        writeFileSync(join(dir, '.next', 'page.tsx'), '');
        writeFileSync(join(dir, 'page.tsx'), '');

        expect(findPageFiles(dir)).toEqual([join(dir, 'page.tsx')]);
    });

    it('returns an empty array for a directory that does not exist', () => {
        expect(findPageFiles(join(dir, 'nope'))).toEqual([]);
    });
});
