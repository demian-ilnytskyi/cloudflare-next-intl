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

    it('opens a file whose own text opens with a "use server" directive — its exports may be called directly during render, not only as a form-bound action', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./action";',
            '/repo/src/app/action.ts': `"use server";\nimport { cookies } from "next/headers";\nexport async function clear() { (await cookies()).delete("x"); }`,
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/action.ts', '/repo/src/app/page.tsx']);
    });

    it('opens a "use server" file with single quotes or a leading "use strict" directive too', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./a";\nimport "./b";',
            "/repo/src/app/a.ts": `'use server';\nexport async function a() {}`,
            '/repo/src/app/b.ts': `"use strict";\n"use server";\nexport async function b() {}`,
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/a.ts', '/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('still includes the entry file itself even if it opens with "use server"', () => {
        const source = `"use server";\nexport async function action() {}`;
        const files = collectReachableFiles('/repo/src/app/action.ts', source, [], makeIo({}));
        expect([...files.keys()]).toEqual(['/repo/src/app/action.ts']);
    });

    it('does NOT skip a file merely mentioning "use server" mid-file (only a leading directive counts)', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': `import { cookies } from "next/headers";\n// calls a "use server" action elsewhere\ncookies();`,
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/b.ts', '/repo/src/app/page.tsx']);
    });

    it('does not trace past a "use client" file — a "use server" action it imports for an event handler carries no render-time signal', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./retry_button";',
            '/repo/src/app/retry_button.tsx': `"use client";\nimport { clearCookies } from "./clear_cookies";\nexport function RetryButton() { return null; }`,
            '/repo/src/app/clear_cookies.ts': `"use server";\nimport { cookies } from "next/headers";\nexport async function clearCookies() { (await cookies()).delete("x"); }`,
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()].sort()).toEqual(['/repo/src/app/page.tsx', '/repo/src/app/retry_button.tsx']);
        expect(files.has('/repo/src/app/clear_cookies.ts')).toBe(false);
    });

    it('still scans a "use client" file\'s own text (entry file case)', () => {
        const source = `"use client";\nexport function C() { const s = searchParams; }`;
        const files = collectReachableFiles('/repo/src/app/c.tsx', source, [], makeIo({}));
        expect(files.get('/repo/src/app/c.tsx')).toBe(source);
    });

    it('does not open a file behind an import whose binding is never referenced (a dead import from a refactor)', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import { resolveAccountGate } from "./account_gate";\nexport default function Page() { return null; }',
            '/repo/src/app/account_gate.ts':
                'import { cookies } from "next/headers";\nexport async function resolveAccountGate() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect([...files.keys()]).toEqual(['/repo/src/app/page.tsx']);
    });

    it('still opens the same import once it is actually called', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import { resolveAccountGate } from "./account_gate";\nexport default async function Page() { await resolveAccountGate(); return null; }',
            '/repo/src/app/account_gate.ts':
                'import { cookies } from "next/headers";\nexport async function resolveAccountGate() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/account_gate.ts')).toBe(true);
    });

    it('follows a default import used only as a JSX tag', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import Content from "./content";\nexport default function Page() { return <Content />; }',
            '/repo/src/app/content.tsx': 'import { cookies } from "next/headers";\ncookies();',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/content.tsx')).toBe(true);
    });

    it('follows a named import used only inside a template literal', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import { greet } from "./greet";\nexport const x = `${greet()}`;',
            '/repo/src/app/greet.ts': 'import { cookies } from "next/headers";\nexport function greet() { cookies(); return ""; }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/greet.ts')).toBe(true);
    });

    it('follows a renamed named import checked by its LOCAL alias, not its original export name', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import { getAuthUser as gau } from "./auth";\nexport default async function Page() { await gau(); return null; }',
            '/repo/src/app/auth.ts':
                'import { cookies } from "next/headers";\nexport async function getAuthUser() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/auth.ts')).toBe(true);
    });

    it('does not skip a renamed named import whose ORIGINAL export name coincidentally appears elsewhere but the local alias does not', () => {
        const map = {
            '/repo/src/app/page.tsx':
                // `getAuthUser` the string appears in a comment; `gau`, the actual local
                // binding, never does. This import IS dead — the file used to call it
                // directly, a rename left the comment behind — and must be skipped.
                'import { getAuthUser as gau } from "./auth";\n// used to call getAuthUser() here\nexport default function Page() { return null; }',
            '/repo/src/app/auth.ts':
                'import { cookies } from "next/headers";\nexport async function getAuthUser() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/auth.ts')).toBe(false);
    });

    it('follows a namespace import used via a property access', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import * as auth from "./auth";\nexport default async function Page() { await auth.getAuthUser(); return null; }',
            '/repo/src/app/auth.ts':
                'import { cookies } from "next/headers";\nexport async function getAuthUser() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/auth.ts')).toBe(true);
    });

    it('always follows a default import combined with a used named import, even if the default itself is unused', () => {
        const map = {
            '/repo/src/app/page.tsx':
                'import Unused, { getAuthUser } from "./auth";\nexport default async function Page() { await getAuthUser(); return null; }',
            '/repo/src/app/auth.ts':
                'import { cookies } from "next/headers";\nexport async function getAuthUser() { return cookies(); }\nexport default function Unused() {}',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/auth.ts')).toBe(true);
    });

    it('always follows a bare side-effect import regardless of usage', () => {
        const map = {
            '/repo/src/app/page.tsx': 'import "./polyfill";\nexport default function Page() { return null; }',
            '/repo/src/app/polyfill.ts': 'import { cookies } from "next/headers";\ncookies();',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/polyfill.ts')).toBe(true);
    });

    it('always follows a re-export regardless of local usage (it has none to check)', () => {
        const map = {
            '/repo/src/app/page.tsx': 'export { fetchThing } from "./repo";\nexport default function Page() { return null; }',
            '/repo/src/app/repo.ts': 'import { cookies } from "next/headers";\nexport function fetchThing() { return cookies(); }',
        };
        const files = collectReachableFiles('/repo/src/app/page.tsx', map['/repo/src/app/page.tsx'], [], makeIo(map));
        expect(files.has('/repo/src/app/repo.ts')).toBe(true);
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
