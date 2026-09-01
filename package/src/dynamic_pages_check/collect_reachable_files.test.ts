import { describe, it, expect } from 'vitest';
import { collectReachableFiles } from './collect_reachable_files.js';

const ALIASES = [{ prefix: '@/', replacement: '/repo/src/' }];

function makeIo(files: Record<string, string>) {
    return {
        readFile: (file: string) => {
            const source = files[file];
            if (source === undefined) throw new Error(`no such file: ${file}`);
            return source;
        },
        isFile: (file: string) => file in files,
    };
}

describe('collectReachableFiles', () => {
    it('always includes the entry file, even with no imports', () => {
        const files = collectReachableFiles('/repo/src/app/page.tsx', 'export default function Page() {}', [], makeIo({}));
        expect([...files.keys()]).toEqual(['/repo/src/app/page.tsx']);
        expect(files.get('/repo/src/app/page.tsx')).toBe('export default function Page() {}');
    });

    it('follows a relative import', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'export const x = 1;',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('follows an alias-prefixed import', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "@/shared/util";',
            '/repo/src/shared/util.ts': 'export const x = 1;',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], ALIASES, makeIo(map));
        expect(files.has('/repo/src/shared/util.ts')).toBe(true);
    });

    it('does not open a bare package specifier', () => {
        const readFile = (file: string) => {
            throw new Error(`should not read: ${file}`);
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', 'import "zod";', [], { readFile, isFile: () => false });
        expect([...files.keys()]).toEqual(['/repo/src/app/page.tsx']);
    });

    it('is cycle-safe (a imports b, b imports a)', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'import "./page";',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('stops at MAX_FILES_VISITED without throwing', () => {
        const FILE_COUNT = 320;
        const map: Record<string, string> = {
            '/repo/src/app/page.tsx': Array.from({ length: FILE_COUNT }, (_, i) => `import "./leaf_${i}";`).join('\n'),
        };
        for (let i = 0; i < FILE_COUNT; i++) map[`/repo/src/app/leaf_${i}.ts`] = 'export const x = 1;';
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.size).toBeLessThanOrEqual(300);
    });
});
