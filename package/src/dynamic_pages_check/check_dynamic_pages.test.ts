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
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'added-force-dynamic', signals: [{ api: 'cookies()', file: '/app/errors/page.tsx', line: 2 }] }]);
        expect(written['/app/errors/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('leaves a page with an explicit `dynamic` export untouched, in any mode', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export const dynamic = "force-dynamic";\nexport default function Page() {}',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'already-declared', explicitValue: 'force-dynamic' }]);
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
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'added-force-dynamic', signals: [{ api: 'cookies()', file: '/app/errors/page.tsx', line: 2 }] }]);
        expect(written['/app/errors/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('mode "report" reports "would-add-force-dynamic" for a page that uses cookies()', async () => {
        const { io } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'would-add-force-dynamic', signals: [{ api: 'cookies()', file: '/app/errors/page.tsx', line: 2 }] }]);
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

            expect(reports).toEqual([{ file: pageFile, action: 'would-add-force-dynamic', signals: [{ api: 'cookies()', file: pageFile, line: 2 }] }]);
            expect(readFileSync(pageFile, 'utf8')).toBe(original);
        });

        it('mode "fix" with real fs writes force-dynamic into the actual file', async () => {
            mkdirSync(dir, { recursive: true });
            const pageFile = join(dir, 'page.tsx');
            writeFileSync(pageFile, 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n', 'utf8');

            const reports = await checkDynamicPages({ appDir: dir, mode: 'fix' });

            expect(reports).toEqual([{ file: pageFile, action: 'added-force-dynamic', signals: [{ api: 'cookies()', file: pageFile, line: 2 }] }]);
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

            expect(reports).toEqual([{ file: pageFile, action: 'would-add-force-dynamic', signals: [{ api: 'cookies()', file: contentFile, line: 2 }] }]);
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

        expect(reports).toEqual([{ file: '/app/audit/[propertyId]/page.tsx', action: 'added-force-dynamic', signals: [{ api: 'getAuthUser()', file: '/app/audit/audit_content.tsx', line: 2 }] }]);
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

        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'already-declared', explicitValue: 'force-dynamic' }]);
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
            { file: '/app/page.tsx', action: 'already-declared', explicitValue: 'force-dynamic' },
            { file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 },
        ]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('prints nothing by default, even for a page it forces dynamic', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report' }, io);
        expect(logSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it('verbose: true prints each page and the (api, file) signals behind a force-dynamic', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/app/errors/page.tsx');
        expect(printed).toContain('cookies()');
        expect(printed).toContain('at /app/errors/page.tsx:2');
        logSpy.mockRestore();
    });

    it('verbose: true prints a page with no signals (e.g. already-declared) without listing any', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nexport default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed.toLowerCase()).toContain('already set');
        expect(printed).not.toContain('↳');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs a would-add-force-static page as ○ Static (SSG)', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', target: 'vinext', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('○');
        expect(printed).toContain('Static (SSG) — would add');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs an already-declared force-static page as ○ Static (SSG)', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-static";\nexport default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('○');
        expect(printed).toContain('Static (SSG) — export const dynamic = "force-static" already set');
        logSpy.mockRestore();
    });

    it('verbose: true includes a loading.tsx file, glyphed and labeled the same as a page.tsx', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/[locale]/property-profile/loading.tsx': 'export default function Loading() { return null; }',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', target: 'vinext', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/:locale/property-profile');
        expect(printed).toContain('Property Profile');
        expect(printed).toContain('○');
        expect(printed).toContain('Static (SSG) — would add');
        logSpy.mockRestore();
    });

    it('verbose: true distinguishes a page.tsx row from a loading.tsx row sharing the same route/label', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/[locale]/(app)/property-profile/page.tsx': 'export default function Page() { return null; }',
            '/app/[locale]/(app)/property-profile/loading.tsx': 'export default function Loading() { return null; }',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', target: 'vinext', verbose: true }, io);
        const lines = logSpy.mock.calls.map((call) => String(call[0]));
        const rows = lines.filter((line) => line.includes('Property Profile'));
        expect(rows.length).toBe(2);
        expect(rows.some((line) => line.includes('[page]'))).toBe(true);
        expect(rows.some((line) => line.includes('[loading]'))).toBe(true);
        // The page row's own route has no suffix; the loading row's route
        // is the page's route with /loading appended, so the two are
        // distinguishable by route alone, not just the trailing tag.
        expect(rows.some((line) => line.includes('/:locale/property-profile  '))).toBe(true);
        expect(rows.some((line) => line.includes('/:locale/property-profile/loading  '))).toBe(true);
        logSpy.mockRestore();
    });

    it('verbose: true glyphs an already-declared non-literal dynamic export as = (value not evaluable)', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/page.tsx': 'const mode = "force-dynamic";\nexport const dynamic = mode;\nexport default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('=');
        expect(printed).toContain('export const dynamic already set');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs a route.ts API route as λ, regardless of its action', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/api/route.ts': 'export default function handler() {}' });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('λ');
        expect(printed).toContain('API route');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs mode "fix"\'s added-force-dynamic/added-force-static the same as their would-add counterparts', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/dynamic/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
            '/app/static/page.tsx': 'export default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', target: 'vinext', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('Dynamic (SSR) — added');
        expect(printed).toContain('Static (SSG) — added');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs no-dynamic-usage-detected (target "next") and a skipped file', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/page.tsx': 'export default function Page() {}',
            '/app/skip-me/page.tsx': 'export default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', skip: ['/app/skip-me/page.tsx'], verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('Unclear — no dynamic-API usage detected');
        expect(printed).toContain('Skipped — excluded from this scan');
        logSpy.mockRestore();
    });

    it('verbose: true falls back to the full path as the file kind when the basename has no recognized extension', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/weird-file': 'export default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/app/weird-file');
        logSpy.mockRestore();
    });

    it('verbose: true glyphs already-declared "auto"/"error" dynamic exports', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/auto/page.tsx': 'export const dynamic = "auto";\nexport default function Page() {}',
            '/app/error/page.tsx': 'export const dynamic = "error";\nexport default function Page() {}',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('export const dynamic = "auto" already set');
        expect(printed).toContain('export const dynamic = "error" already set');
        logSpy.mockRestore();
    });

    it('verbose: true draws a ├ tree connector for every row but the last, which gets └', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/first/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
            '/app/second/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printedLines = logSpy.mock.calls.map((call) => String(call[0]));
        const rowLines = printedLines.filter((line) => /^[├└]/.test(line));
        expect(rowLines[0]).toMatch(/^├/);
        expect(rowLines[1]).toMatch(/^└/);
        // the signal line under the non-last row uses the │ continuation
        const signalLines = printedLines.filter((line) => line.includes('↳'));
        expect(signalLines[0]).toMatch(/^│/);
        expect(signalLines[1]).toMatch(/^ /);
        logSpy.mockRestore();
    });

    it('verbose: { pageLabel: "path" } uses displayPath instead of the derived title', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/accept-invite/page.tsx': 'export default function Page() {}' });
        await checkDynamicPages({ appDir: APP_DIR, mode: 'report', target: 'vinext', verbose: { pageLabel: 'path' } }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/app/accept-invite/page.tsx');
        logSpy.mockRestore();
    });

    it('verbose: true attributes a signal to the imported file it actually came from', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/page.tsx': 'import "./helper";\nexport default function Page() {}',
        });
        io.readFile = vi.fn((file: string) => {
            if (file === '/app/page.tsx') return 'import "./helper";\nexport default function Page() {}';
            if (file === '/app/helper.ts') return 'import { cookies } from "next/headers";\nawait cookies();';
            throw new Error(`unexpected read: ${file}`);
        });
        io.isFile = vi.fn((file: string) => file === '/app/page.tsx' || file === '/app/helper.ts');

        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report', verbose: true }, io);

        expect(reports[0]).toEqual({
            file: '/app/page.tsx',
            action: 'would-add-force-dynamic',
            signals: [{ api: 'cookies()', file: '/app/helper.ts', line: 2 }],
        });
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('via /app/helper.ts:2');
        logSpy.mockRestore();
    });

    it('verbose: true prints a path relative to cwd when the scanned file is inside it', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const cwdFile = join(process.cwd(), 'app', 'errors', 'page.tsx');
        const { io } = makeIo({
            [cwdFile]: 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        await checkDynamicPages({ appDir: join(process.cwd(), 'app'), mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain(join('app', 'errors', 'page.tsx'));
        expect(printed).not.toContain(cwdFile);
        logSpy.mockRestore();
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
