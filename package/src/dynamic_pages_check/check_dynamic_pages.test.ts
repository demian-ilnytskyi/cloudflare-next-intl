import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDynamicPages } from './check_dynamic_pages.js';

const APP_DIR = '/app';

function makeIo(sources: Record<string, string>) {
    const written: Record<string, string> = {};
    return {
        io: {
            findPageFiles: vi.fn(() => Object.keys(sources)),
            readFile: vi.fn((file: string) => sources[file]),
            writeFile: vi.fn((file: string, contents: string) => {
                written[file] = contents;
            }),
        },
        written,
    };
}

describe('checkDynamicPages', () => {
    it('mode "off" scans nothing and returns an empty report', async () => {
        const { io } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'off' }, io);
        expect(reports).toEqual([]);
        expect(io.findPageFiles).not.toHaveBeenCalled();
    });

    it('reports "no-dynamic-usage-detected" (and never writes) for a static-looking page, in any mode', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'no-dynamic-usage-detected' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" writes force-dynamic into a page that uses cookies()', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'added-force-dynamic' }]);
        expect(written['/app/errors/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('leaves a page with an explicit `dynamic` export untouched, in any mode', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export const dynamic = "force-dynamic";\nexport default function Page() {}',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'already-declared' }]);
        expect(written).toEqual({});
    });

    it('target "vinext" writes force-static (not left alone) for a static-looking page', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', target: 'vinext' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'added-force-static' }]);
        expect(written['/app/page.tsx']).toContain('export const dynamic = "force-static";');
    });

    it('target "vinext" in report mode reports "would-add-force-static" and writes nothing', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report', target: 'vinext' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'would-add-force-static' }]);
        expect(written).toEqual({});
    });

    it('target "vinext" still writes force-dynamic (not force-static) for a page with dynamic-API usage', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', target: 'vinext' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'added-force-dynamic' }]);
        expect(written['/app/errors/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('mode "report" reports "would-add-force-dynamic" for a page that uses cookies()', async () => {
        const { io } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'would-add-force-dynamic' }]);
    });

    describe('with real fs (no io overrides)', () => {
        let dir: string;
        beforeEach(() => {
            dir = mkdtempSync(join(tmpdir(), 'cfni-check-dynamic-pages-'));
        });
        afterEach(() => rmSync(dir, { recursive: true, force: true }));

        it('returns an empty report for a directory with no page/route files', async () => {
            const reports = await checkDynamicPages({ appDir: '/definitely-does-not-exist-xyz', mode: 'report' });
            expect(reports).toEqual([]);
        });

        it('defaults to mode "report" and never writes real files when no mode is given', async () => {
            mkdirSync(dir, { recursive: true });
            const pageFile = join(dir, 'page.tsx');
            const original = 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n';
            writeFileSync(pageFile, original, 'utf8');

            const reports = await checkDynamicPages({ appDir: dir });

            expect(reports).toEqual([{ file: pageFile, action: 'would-add-force-dynamic' }]);
            expect(readFileSync(pageFile, 'utf8')).toBe(original);
        });

        it('mode "fix" with real fs writes force-dynamic into the actual file', async () => {
            mkdirSync(dir, { recursive: true });
            const pageFile = join(dir, 'page.tsx');
            writeFileSync(pageFile, 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n', 'utf8');

            const reports = await checkDynamicPages({ appDir: dir, mode: 'fix' });

            expect(reports).toEqual([{ file: pageFile, action: 'added-force-dynamic' }]);
            expect(readFileSync(pageFile, 'utf8')).toContain('export const dynamic = "force-dynamic";');
        });

        it('with real fs (no io.isFile override) follows a real local import to a file that exists, and ignores one that does not', async () => {
            mkdirSync(dir, { recursive: true });
            const pageFile = join(dir, 'page.tsx');
            const contentFile = join(dir, 'content.tsx');
            writeFileSync(
                pageFile,
                'import Content from "./content";\nimport "./does_not_exist";\nexport default function Page() { return <Content />; }\n',
                'utf8',
            );
            writeFileSync(
                contentFile,
                'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
                'utf8',
            );

            const reports = await checkDynamicPages({ appDir: dir, mode: 'report' });

            expect(reports).toEqual([{ file: pageFile, action: 'would-add-force-dynamic' }]);
        });
    });

    it('follows a local import to catch getAuthUser() usage the page file itself never mentions (regression: CRV audit page)', async () => {
        const { io, written } = makeIo({
            '/app/audit/[propertyId]/page.tsx': 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/audit/[propertyId]/page.tsx') {
                return 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }';
            }
            if (file === '/app/audit/audit_content.tsx') {
                return 'import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }';
            }
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) =>
            file === '/app/audit/audit_content.tsx' || file === '/app/audit/[propertyId]/page.tsx'
        );

        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'fix', target: 'vinext' },
            io,
        );

        expect(reports).toEqual([{ file: '/app/audit/[propertyId]/page.tsx', action: 'added-force-dynamic' }]);
        expect(written['/app/audit/[propertyId]/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('resolveImports: false disables local-import tracing (single-file behavior)', async () => {
        const { io, written } = makeIo({
            '/app/audit/[propertyId]/page.tsx': 'import AuditContent from "../audit_content";\nexport default function Page() { return <AuditContent />; }',
        });
        io.isFile = vi.fn(() => true);

        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'fix', target: 'vinext', resolveImports: false },
            io,
        );

        expect(reports).toEqual([{ file: '/app/audit/[propertyId]/page.tsx', action: 'added-force-static' }]);
        expect(written['/app/audit/[propertyId]/page.tsx']).toContain('export const dynamic = "force-static";');
    });

    it('syncErrorReportingAuthUser defaults to false: leaves an eligible reportError call untouched', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/page.tsx') return 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}';
            if (file === '/repo.ts') return `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`;
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) => file === '/app/page.tsx' || file === '/repo.ts');

        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'already-declared' }]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('syncErrorReportingAuthUser: true appends its own reports and rewrites the eligible call', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/page.tsx') return 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}';
            if (file === '/repo.ts') return `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`;
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) => file === '/app/page.tsx' || file === '/repo.ts');

        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', syncErrorReportingAuthUser: true }, io);

        expect(reports).toEqual([
            { file: '/app/page.tsx', action: 'already-declared' },
            { file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 },
        ]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('skips every file listed in `skip`, without reading or writing it', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export default function Page() {}',
            '/app/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', skip: ['/app/errors/page.tsx'] }, io);
        expect(reports).toEqual(expect.arrayContaining([{ file: '/app/errors/page.tsx', action: 'skipped' }]));
        expect(written['/app/errors/page.tsx']).toBeUndefined();
        expect(written['/app/page.tsx']).toBeDefined();
    });
});
