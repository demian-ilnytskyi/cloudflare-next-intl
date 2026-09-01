import { describe, it, expect } from 'vitest';
import { traceDynamicUsage } from './trace_dynamic_usage.js';

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

describe('traceDynamicUsage', () => {
    it('finds a signal in the entry file itself, same as detectDynamicUsage', () => {
        const source = 'import { cookies } from "next/headers";\ncookies();';
        const result = traceDynamicUsage('/repo/src/app/page.tsx', source, [], makeIo({}));
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('finds a signal in a file reached through a relative import', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'export { default } from "./audit_content";',
            '/repo/src/app/audit/audit_content.tsx':
                'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('follows two hops: page -> content -> repository -> getAuthUser()', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'import AuditContent from "./audit_content";',
            '/repo/src/app/audit/audit_content.tsx': 'import { fetchDraft } from "./audit_draft_repository";',
            '/repo/src/app/audit/audit_draft_repository.ts':
                'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function fetchDraft() { await getAuthUser(); }',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('follows an alias-prefixed import', () => {
        const files = {
            '/repo/src/app/audit/page.tsx': 'import requireFlavour from "@/shared/utils/require_flavour";',
            '/repo/src/shared/utils/require_flavour.ts':
                'import { headers } from "next/headers";\nheaders();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/audit/page.tsx',
            files['/repo/src/app/audit/page.tsx'],
            ALIASES,
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('headers()');
    });

    it('defaults to treating every specifier as unresolvable when io.isFile is omitted', () => {
        const readFile = (file: string) => {
            throw new Error(`should not read: ${file}`);
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            'import { cookies } from "next/headers";\nimport "./b";\ncookies();',
            [],
            { readFile },
        );
        expect(result.detectedDynamicApis).toEqual(['cookies()']);
    });

    it('stops opening new files once the visited-file cap is reached, without throwing', () => {
        const FILE_COUNT = 320;
        const files: Record<string, string> = {
            '/repo/src/app/page.tsx': Array.from(
                { length: FILE_COUNT },
                (_, i) => `import "./leaf_${i}";`,
            ).join('\n'),
        };
        for (let i = 0; i < FILE_COUNT; i++) {
            files[`/repo/src/app/leaf_${i}.ts`] = 'export const x = 1;';
        }
        const io = {
            readFile: (file: string) => {
                const source = files[file];
                if (source === undefined) throw new Error(`no such file: ${file}`);
                return source;
            },
            isFile: (file: string) => file in files,
        };
        const result = traceDynamicUsage('/repo/src/app/page.tsx', files['/repo/src/app/page.tsx'], [], io);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('does not open a bare package specifier', () => {
        const readFile = (file: string) => {
            throw new Error(`should not read: ${file}`);
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            'import { z } from "zod";',
            [],
            { readFile, isFile: () => false },
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('is cycle-safe (a imports b, b imports a)', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import "./b";',
            '/repo/src/app/b.ts': 'import "./page";\nimport { cookies } from "next/headers";\ncookies();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('reports hasExplicitDynamicExport from the entry file only, not an imported file', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import "./other";',
            '/repo/src/app/other.ts': 'export const dynamic = "force-dynamic";',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.hasExplicitDynamicExport).toBe(false);
    });

    it('skips a resolved import whose file cannot be read (e.g. deleted between resolve and read) without throwing', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import { cookies } from "next/headers";\nimport "./b";\ncookies();',
        };
        const io = {
            readFile: (file: string) => {
                const source = files[file as keyof typeof files];
                if (source === undefined) throw new Error(`no such file: ${file}`);
                return source;
            },
            // isFile claims "./b" resolves, but readFile below has no entry for
            // it — the read-after-resolve race this branch guards against.
            isFile: (file: string) => file === '/repo/src/app/b.ts',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            io,
        );
        expect(result.detectedDynamicApis).toEqual(['cookies()']);
    });

    it('deduplicates a signal found in multiple files', () => {
        const files = {
            '/repo/src/app/page.tsx': 'import { cookies } from "next/headers";\nimport "./b";\ncookies();',
            '/repo/src/app/b.ts': 'import { cookies } from "next/headers";\ncookies();',
        };
        const result = traceDynamicUsage(
            '/repo/src/app/page.tsx',
            files['/repo/src/app/page.tsx'],
            [],
            makeIo(files),
        );
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });
});
