import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLocaleParams } from './check_locale_params.js';

const APP_DIR = '/app';

function makeIo(sources: Record<string, string>) {
    const written: Record<string, string> = {};
    return {
        io: {
            findLocaleScopedFiles: vi.fn(() => Object.keys(sources)),
            readFile: vi.fn((file: string) => sources[file]),
            writeFile: vi.fn((file: string, contents: string) => {
                written[file] = contents;
            }),
        },
        written,
    };
}

describe('checkLocaleParams', () => {
    it('defaults to mode "report": scans and reports, but never writes', async () => {
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': 'export default function Page() {\n    return null;\n}' });
        const reports = await checkLocaleParams({ appDir: APP_DIR }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'would-add-locale-params' }]);
        expect(written).toEqual({});
    });

    it('mode "off" scans nothing and returns an empty report', async () => {
        const { io } = makeIo({ '/app/[locale]/page.tsx': 'export default function Page() {}' });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'off' }, io);
        expect(reports).toEqual([]);
        expect(io.findLocaleScopedFiles).not.toHaveBeenCalled();
    });

    it('reports "already-set-up" (and never writes) for a page using setLocaleAsync(params) — real example/[locale]/page.tsx shape', async () => {
        const source = `import { getTranslations, setLocaleAsync } from "cloudflare-next-intl";\nexport default async function Home({ params }: {\n  params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n  await setLocaleAsync(params);\n  const t = await getTranslations("HomePage");\n}`;
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'already-set-up' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" adds full setup (signature + body + import) to a zero-arg page — example/[locale]/[...rest]/page.tsx shape', async () => {
        const source = `export default function NotFoundFallbackPage() {\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/[...rest]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/[...rest]/page.tsx', action: 'added-locale-params' }]);
        const result = written['/app/[locale]/[...rest]/page.tsx']!;
        expect(result).toContain('{ params }: {');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        expect(result).toContain('import { setLocale } from "cloudflare-next-intl";');
    });

    it('mode "fix" adds only the missing setLocale call to a page with an inline destructure — example/[locale]/login/page.tsx shape', async () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function LoginPage({ params }: {\n    params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n    const { locale } = await params;\n    const t = await getTranslations("LoginPage", locale);\n}`;
        const { io, written } = makeIo({ '/app/[locale]/login/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/login/page.tsx', action: 'added-locale-params' }]);
        const result = written['/app/[locale]/login/page.tsx']!;
        expect(result.match(/await params/g)?.length).toBe(1);
        expect(result).toContain('setLocale(locale);');
        expect(result).toContain('import { getTranslations, setLocale } from "cloudflare-next-intl";');
    });

    it('reports "needs-manual-edit" when insertLocaleParamsBody cannot find the safe insertion point it detected (comment-split destructure)', async () => {
        const source = 'export default function Page({ params }) {\n  const { locale /* } */ } = await params;\n}';
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'needs-manual-edit' }]);
        expect(written).toEqual({});
    });

    it('mode "report" says what it would do without writing anything', async () => {
        const source = `export default function Page() {\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'would-add-locale-params' }]);
        expect(written).toEqual({});
    });

    it('reports "needs-manual-edit" for a layout with the Readonly<{...}> multi-prop shape (example/[locale]/layout.tsx)', async () => {
        const source = `export default async function RootLayout({\n  children,\n  params,\n}: Readonly<{\n  children: React.ReactNode;\n  params: Promise<{ locale: string }>;\n}>): Promise<Component> {\n  const result = await params;\n  const locale = result?.locale ?? "en";\n}`;
        const { io, written } = makeIo({ '/app/[locale]/layout.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        // Resolves locale via `result?.locale ?? default`, not a recognized
        // inline destructure — inserting a second, blind `const { locale } =
        // await params` here would collide with the existing `const locale`
        // declaration, so this is reported for a human instead of written.
        expect(reports).toEqual([{ file: '/app/[locale]/layout.tsx', action: 'needs-manual-edit' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" reuses an existing { params } prop (no inline destructure yet, no conflicting binding) instead of needs-manual-edit — real CRV property-profile/loading.tsx shape', async () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function PropertyProfileLoading({ params }: {\n    params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/property-profile/loading.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/property-profile/loading.tsx', action: 'added-locale-params' }]);
        const result = written['/app/[locale]/property-profile/loading.tsx']!;
        // The existing `{ params }` signature is untouched — no second params prop inserted.
        expect(result.match(/\{\s*params\s*\}/g)?.length).toBe(1);
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        expect(result).toContain('import { getTranslations, setLocale } from "cloudflare-next-intl";');
    });

    it('mode "fix" widens an existing params type typed for an unrelated key before reusing it — exact user-reported repro (params typed for "test", not locale)', async () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function PropertyProfileLoading({ params }: {\n    params: Promise<{ test: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/property-profile/loading.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/property-profile/loading.tsx', action: 'added-locale-params' }]);
        const result = written['/app/[locale]/property-profile/loading.tsx']!;
        // "test" is kept — this codemod extends the type, never removes an
        // existing key it doesn't understand the purpose of.
        expect(result).toContain('params: Promise<{ test: Language; locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
    });

    it('mode "report" reports "would-add-locale-params" for the same reuse-existing-params case', async () => {
        const source = `export default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'would-add-locale-params' }]);
        expect(written).toEqual({});
    });

    it('reuses an existing { children, params } multi-prop signature (no conflicting binding)', async () => {
        const source = `export default async function Layout({ children, params }: {\n    children: React.ReactNode;\n    params: Promise<{ locale: Language }>;\n}) {\n    return children;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/layout.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/layout.tsx', action: 'added-locale-params' }]);
        expect(written['/app/[locale]/layout.tsx']).toContain('const { locale } = await params;');
    });

    it('still reports "needs-manual-edit" for an aliased params destructure ({ params: routeParams })', async () => {
        const source = `export default async function Page({ params: routeParams }: { params: Promise<{ locale: Language }> }) {\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/page.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/page.tsx', action: 'needs-manual-edit' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" adds params as a second destructured key when the existing prop has no params key at all — exact user-reported repro', async () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function PropertyProfileLoading({ test }: {\n    test: Promise<{ test: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n\n    return null;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/property-profile/loading.tsx': source });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/property-profile/loading.tsx', action: 'added-locale-params' }]);
        const result = written['/app/[locale]/property-profile/loading.tsx']!;
        expect(result).toContain('{ test, params }');
        expect(result).toContain('test: Promise<{ test: Language }>; params: Promise<{ locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        // "test" and its own usage are completely untouched.
        expect(result).toContain("await getTranslations('PropertyIntake')");
    });

    it('respects the skip list: neither read nor written, reported as "skipped"', async () => {
        const { io, written } = makeIo({ '/app/[locale]/special/page.tsx': 'export default function Page() {}' });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'fix', skip: ['/app/[locale]/special/page.tsx'] }, io);
        expect(reports).toEqual([{ file: '/app/[locale]/special/page.tsx', action: 'skipped' }]);
        expect(io.readFile).not.toHaveBeenCalled();
        expect(written).toEqual({});
    });

    it('respects per-file overrides for a custom localeParam name', async () => {
        const source = `export default function Page({ params }: { params: Promise<{ lang: Language }> }) {\n    const { lang } = await params;\n}`;
        const { io, written } = makeIo({ '/app/[locale]/legacy/page.tsx': source });
        const reports = await checkLocaleParams(
            { appDir: APP_DIR, mode: 'fix', overrides: { '/app/[locale]/legacy/page.tsx': { localeParam: 'lang' } } },
            io,
        );
        expect(reports).toEqual([{ file: '/app/[locale]/legacy/page.tsx', action: 'added-locale-params' }]);
        expect(written['/app/[locale]/legacy/page.tsx']).toContain('setLocale(lang);');
    });

    it('mode "off" short-circuits even with other options set', async () => {
        const { io } = makeIo({ '/app/[locale]/page.tsx': 'export default function Page() {}' });
        const reports = await checkLocaleParams({ appDir: APP_DIR, mode: 'off', localeParam: 'lang' }, io);
        expect(reports).toEqual([]);
    });

    it('verbose: false (the default) prints nothing', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/[locale]/page.tsx': 'export default function Page() { return null; }' });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report' }, io);
        expect(logSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it('verbose: true prints each file with a reason, including a loading.tsx', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/[locale]/(app)/property-profile/loading.tsx': 'export default function Loading() { return null; }',
        });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/:locale/property-profile');
        expect(printed).toContain('Property Profile');
        expect(printed).toContain('+');
        expect(printed).toContain('Missing locale-param setup — would add it');
        logSpy.mockRestore();
    });

    it('verbose: true labels an already-set-up page distinctly from one needing setup', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const source = `import { setLocaleAsync } from "cloudflare-next-intl";\nexport default async function Home({ params }: { params: Promise<{ locale: Language }> }) {\n  await setLocaleAsync(params);\n}`;
        const { io } = makeIo({ '/app/[locale]/page.tsx': source });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('✓');
        expect(printed).toContain('Already resolves locale');
        logSpy.mockRestore();
    });

    it('verbose: true labels an added-locale-params (mode "fix") and a skipped file', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({
            '/app/[locale]/page.tsx': 'export default function Page() {}',
            '/app/[locale]/skip-me/page.tsx': 'export default function Page() {}',
        });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'fix', skip: ['/app/[locale]/skip-me/page.tsx'], verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('Missing locale-param setup — added it');
        expect(printed).toContain('Skipped — excluded from this scan');
        logSpy.mockRestore();
    });

    it('verbose: true falls back to the full path as the file kind when the basename has no recognized extension', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/[locale]/weird-file': 'export default function Page() {}' });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('/app/[locale]/weird-file');
        logSpy.mockRestore();
    });

    it('accepts verbose as an object with a custom pageLabel', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { io } = makeIo({ '/app/[locale]/page.tsx': 'export default function Page() {}' });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report', verbose: { pageLabel: () => 'Custom Label' } }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('Custom Label');
        logSpy.mockRestore();
    });

    it('verbose: true prints a path relative to cwd (not the raw absolute path) for a file actually under cwd', async () => {
        const dir = mkdtempSync(join(process.cwd(), 'cfni-check-locale-params-cwd-'));
        try {
            const localeDir = join(dir, '[locale]');
            mkdirSync(localeDir, { recursive: true });
            const pageFile = join(localeDir, 'page.tsx');
            writeFileSync(pageFile, 'export default function Page() {\n    return null;\n}', 'utf8');
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await checkLocaleParams({ appDir: dir, mode: 'report', verbose: { pageLabel: 'path' } });

            const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
            expect(printed).not.toContain(pageFile);
            logSpy.mockRestore();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    describe('with real fs (no io overrides)', () => {
        let dir: string;
        beforeEach(() => {
            dir = mkdtempSync(join(tmpdir(), 'cfni-check-locale-params-'));
        });
        afterEach(() => rmSync(dir, { recursive: true, force: true }));

        it('defaults to mode "report" and never writes real files when no mode is given, printing the default relative-path label', async () => {
            const localeDir = join(dir, '[locale]');
            mkdirSync(localeDir, { recursive: true });
            const pageFile = join(localeDir, 'page.tsx');
            const original = 'export default function Page() {\n    return null;\n}';
            writeFileSync(pageFile, original, 'utf8');
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const reports = await checkLocaleParams({ appDir: dir, verbose: { pageLabel: 'path' } });

            expect(reports).toEqual([{ file: pageFile, action: 'would-add-locale-params' }]);
            expect(readFileSync(pageFile, 'utf8')).toBe(original);
            const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
            expect(printed).toContain(pageFile);
            logSpy.mockRestore();
        });
    });

    it('verbose: true labels a needs-manual-edit file with its own reason', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const source = `export default async function RootLayout({\n  children,\n  params,\n}: Readonly<{\n  children: React.ReactNode;\n  params: Promise<{ locale: string }>;\n}>) {\n  const result = await params;\n  const locale = result?.locale ?? "en";\n}`;
        const { io } = makeIo({ '/app/[locale]/layout.tsx': source });
        await checkLocaleParams({ appDir: APP_DIR, mode: 'report', verbose: true }, io);
        const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('?');
        expect(printed).toContain('needs a manual edit');
        logSpy.mockRestore();
    });
});
