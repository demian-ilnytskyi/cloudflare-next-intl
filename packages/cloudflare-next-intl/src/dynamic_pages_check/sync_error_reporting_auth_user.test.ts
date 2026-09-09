import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncErrorReportingAuthUser } from './sync_error_reporting_auth_user.js';

const APP_DIR = '/app';

function makeIo(sources: Record<string, string>) {
    const written: Record<string, string> = {};
    return {
        io: {
            findPageFiles: vi.fn(() => Object.keys(sources).filter((f) => f.includes('/app/'))),
            readFile: vi.fn((file: string) => {
                const source = sources[file];
                if (source === undefined) throw new Error(`no such file: ${file}`);
                return source;
            }),
            writeFile: vi.fn((file: string, contents: string) => {
                sources[file] = contents;
                written[file] = contents;
            }),
            isFile: vi.fn((file: string) => file in sources),
        },
        written,
    };
}

describe('syncErrorReportingAuthUser', () => {
    it('mode "off" scans nothing and returns an empty report', async () => {
        const { io } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'off' }, io);
        expect(reports).toEqual([]);
        expect(io.findPageFiles).not.toHaveBeenCalled();
    });

    it('adds useAuthUser: true to a reportError call reached only from a force-dynamic page', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('does NOT touch a reportError call reached from both a dynamic page and a static/unknown page', async () => {
        const { io, written } = makeIo({
            '/app/dynamic_page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function A() {}',
            '/app/static_page.tsx': 'export const dynamic = "force-static";\nimport "../repo";\nexport default function B() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('leaves a call with an already-explicit useAuthUser untouched', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X', useAuthUser: false });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('defaults to mode "report" when mode is omitted', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'would-add-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('mode "report" reports would-add-use-auth-user and writes nothing', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'report' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'would-add-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('a page with no explicit export on target "next" is not-confirmed-dynamic even with a detected signal (Next decides, not this pass)', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'import { cookies } from "next/headers";\ncookies();\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', target: 'next' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('a page with no explicit export on target "vinext" and no detected signal is not-confirmed-dynamic', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'import "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', target: 'vinext' }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('honors explicit aliases instead of the default @/ mapping', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "#lib/repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser(
            { appDir: APP_DIR, mode: 'fix', aliases: [{ prefix: '#lib/', replacement: '/' }] },
            io,
        );

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('honors an explicit skip list, leaving that page out of both buckets', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', skip: ['/app/page.tsx'] }, io);

        expect(reports).toEqual([]);
        expect(written['/repo.ts']).toBeUndefined();
    });

    it('a page with no explicit export on target "vinext" with a detected signal counts as force-dynamic', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'import { cookies } from "next/headers";\ncookies();\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });`,
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix', target: 'vinext' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 1 }]);
        expect(written['/repo.ts']).toContain('useAuthUser: true,');
    });

    it('counts multiple untouched calls in the same safely-reachable file', async () => {
        const { io, written } = makeIo({
            '/app/page.tsx': 'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}',
            '/repo.ts': [
                `import { reportError } from "cloudflare-next-intl/errorHandling";`,
                `void reportError(cfg, { classOrMethodName: 'A' });`,
                `void reportError(cfg, { classOrMethodName: 'B' });`,
            ].join('\n'),
        });

        const reports = await syncErrorReportingAuthUser({ appDir: APP_DIR, mode: 'fix' }, io);

        expect(reports).toEqual([{ file: '/repo.ts', action: 'added-use-auth-user', callCount: 2 }]);
        expect(written['/repo.ts']).toMatch(/classOrMethodName: 'A'[\s\S]*useAuthUser: true,|useAuthUser: true,[\s\S]*classOrMethodName: 'A'/);
    });

    describe('with real fs (no io overrides)', () => {
        let dir: string;
        beforeEach(() => {
            dir = mkdtempSync(join(tmpdir(), 'cfni-sync-error-reporting-'));
        });
        afterEach(() => rmSync(dir, { recursive: true, force: true }));

        it('follows a real local import and rewrites the real file', () => {
            const appDir = join(dir, 'src', 'app');
            mkdirSync(appDir, { recursive: true });
            const pageFile = join(appDir, 'page.tsx');
            const repoFile = join(dir, 'src', 'repo.ts');
            writeFileSync(
                pageFile,
                'export const dynamic = "force-dynamic";\nimport "../repo";\nexport default function Page() {}\n',
                'utf8',
            );
            writeFileSync(
                repoFile,
                `import { reportError } from "cloudflare-next-intl/errorHandling";\nvoid reportError(cfg, { classOrMethodName: 'X' });\n`,
                'utf8',
            );

            return syncErrorReportingAuthUser({ appDir, mode: 'fix' }).then((reports) => {
                expect(reports).toEqual([{ file: repoFile, action: 'added-use-auth-user', callCount: 1 }]);
                expect(readFileSync(repoFile, 'utf8')).toContain('useAuthUser: true,');
            });
        });
    });
});
