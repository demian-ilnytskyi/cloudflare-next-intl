import { describe, it, expect, vi } from 'vitest';
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

    it('mode "report" never writes, and reports "would-add-force-static" for a static-looking page', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'would-add-force-static' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" writes force-static into a page with no dynamic-API usage', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}\n' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'added-force-static' }]);
        expect(written['/app/page.tsx']).toContain('export const dynamic = "force-static";');
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

    it('skips every file listed in `skip`, without reading or writing it', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export default function Page() {}',
            '/app/page.tsx': 'export default function Page() {}',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', skip: ['/app/errors/page.tsx'] }, io);
        expect(reports).toEqual(expect.arrayContaining([{ file: '/app/errors/page.tsx', action: 'skipped' }]));
        expect(written['/app/errors/page.tsx']).toBeUndefined();
        expect(written['/app/page.tsx']).toBeDefined();
    });
});
