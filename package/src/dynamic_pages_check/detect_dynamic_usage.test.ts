import { describe, it, expect } from 'vitest';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';

describe('detectDynamicUsage', () => {
    it('finds no explicit export and no dynamic APIs in a plain static page', () => {
        const result = detectDynamicUsage(`export default function Page() { return <div>hi</div>; }`);
        expect(result.hasExplicitDynamicExport).toBe(false);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('detects an existing export const dynamic', () => {
        const result = detectDynamicUsage(`export const dynamic = "force-dynamic";\nexport default function Page() {}`);
        expect(result.hasExplicitDynamicExport).toBe(true);
    });

    it('detects cookies()/headers() usage from next/headers', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\nasync function f() { await cookies(); }`);
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('ignores a dynamic-API name mentioned only in a // comment', () => {
        const result = detectDynamicUsage(`// used to call getAuthUser() here\nexport default function Page() {}`);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('ignores a dynamic-API name mentioned only in a /* */ comment, across multiple lines', () => {
        const result = detectDynamicUsage(
            `/**\n * getAuthUser() is cache()'d per request, so this costs nothing extra.\n */\nexport default function Page() {}`,
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('still finds a real call on the line right after a comment that merely mentions the same api', () => {
        const result = detectDynamicUsage(
            `// getAuthUser() is cache()'d per request\nimport { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { await getAuthUser(); }`,
        );
        expect(result.matches).toEqual([{ name: 'getAuthUser()', line: 3 }]);
    });

    it('does not treat a URL\'s "//" as a comment start', () => {
        const result = detectDynamicUsage(`const url = "https://example.com";\nasync function f() { await cookies(); }`);
        expect(result.matches).toEqual([{ name: 'cookies()', line: 2 }]);
    });

    it('blanks out an unterminated /* comment through the end of the file', () => {
        const result = detectDynamicUsage(`/* leftover comment mentioning cookies()`);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('blanks out a // comment with no trailing newline, at the end of the file', () => {
        const result = detectDynamicUsage(`export default function Page() {}\n// mentions cookies() here`);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('does not count a commented-out export const dynamic as declared', () => {
        const result = detectDynamicUsage(`// export const dynamic = "force-static";\nexport default function Page() {}`);
        expect(result.hasExplicitDynamicExport).toBe(false);
    });

    it('reports the 1-based line of each match, not just its presence', () => {
        const result = detectDynamicUsage(
            `import { cookies } from "next/headers";\n\nasync function f() {\n    await cookies();\n}`,
        );
        expect(result.matches).toContainEqual({ name: 'cookies()', line: 4 });
    });

    it('reports the line of the FIRST match when an api appears more than once', () => {
        const result = detectDynamicUsage(`await cookies();\nawait cookies();`);
        expect(result.matches).toEqual([{ name: 'cookies()', line: 1 }]);
    });

    it('detects a searchParams prop', () => {
        const result = detectDynamicUsage(`export default async function Page({ searchParams }) {}`);
        expect(result.detectedDynamicApis).toContain('searchParams');
    });

    it('detects unstable_noStore()', () => {
        const result = detectDynamicUsage(`import { unstable_noStore } from "next/cache";\nunstable_noStore();`);
        expect(result.detectedDynamicApis).toContain('unstable_noStore()');
    });

    it('detects cache: "no-store" fetch options', () => {
        const result = detectDynamicUsage(`fetch(url, { cache: "no-store" });`);
        expect(result.detectedDynamicApis).toContain('cache: "no-store"');
    });

    it('does NOT flag a dev-gated cache ternary — the prod branch is the one that gets prerendered', () => {
        const result = detectDynamicUsage(`fetchText(url, { cache: Config.isDev ? "no-store" : undefined });`);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('does NOT flag a dev-gated revalidate ternary', () => {
        const result = detectDynamicUsage(`fetchText(url, { next: { revalidate: Config.isDev ? 0 : 3600 } });`);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('does NOT flag a revalidate read out of a variable', () => {
        const result = detectDynamicUsage(
            `const revalidateSeconds = Config.isDev ? 0 : 3600;\nfetchText(url, { next: { revalidate: revalidateSeconds } });`,
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('detects getAuthUser() as a dynamic signal (it wraps cookies())', () => {
        const result = detectDynamicUsage(
            `import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { const { user } = await getAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('detects useAuthUser() as a dynamic signal', () => {
        const result = detectDynamicUsage(
            `import useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";\nasync function f() { await useAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('useAuthUser()');
    });

    it('does NOT flag useAuthUser() in a "use client" file — that resolves to the client-side context hook, never cookies()', () => {
        const result = detectDynamicUsage(
            `"use client";\n\nimport useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";\nexport default function Widget() { const { user } = useAuthUser(); return null; }`
        );
        expect(result.detectedDynamicApis).not.toContain('useAuthUser()');
    });

    it('still flags useAuthUser() in a "use client" file that has a leading "use strict" directive first', () => {
        const result = detectDynamicUsage(
            `"use strict";\n"use client";\nimport useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";\nuseAuthUser();`
        );
        expect(result.detectedDynamicApis).not.toContain('useAuthUser()');
    });

    it('detects withUserDb() as a dynamic signal (it resolves uid via getAuthUser()/cookies internally)', () => {
        const result = detectDynamicUsage(
            `import { withUserDb } from "cloudflare-next-intl/db";\nasync function f() { return withUserDb((db) => db.select().from(table)); }`
        );
        expect(result.detectedDynamicApis).toContain('withUserDb()');
    });

    it('deduplicates repeated matches of the same API', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\ncookies(); cookies(); cookies();`);
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });

    it('runs a caller-supplied extraChecks pattern alongside the built-ins', () => {
        const result = detectDynamicUsage(
            'async function f() { await myOrgAuth(); }',
            [{ name: 'myOrgAuth()', pattern: /\bmyOrgAuth\s*\(/ }],
        );
        expect(result.detectedDynamicApis).toEqual(['myOrgAuth()']);
    });

    it('does not flag an extraChecks pattern when it does not match', () => {
        const result = detectDynamicUsage(
            'export default function Page() {}',
            [{ name: 'myOrgAuth()', pattern: /\bmyOrgAuth\s*\(/ }],
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('still ignores an extraChecks match found only in a comment', () => {
        const result = detectDynamicUsage(
            '// used to call myOrgAuth() here\nexport default function Page() {}',
            [{ name: 'myOrgAuth()', pattern: /\bmyOrgAuth\s*\(/ }],
        );
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('resets a global-flagged extraChecks pattern\'s lastIndex between calls', () => {
        const check = { name: 'myOrgAuth()', pattern: /\bmyOrgAuth\s*\(/g };
        const withMatch = detectDynamicUsage('myOrgAuth();', [check]);
        const withoutMatch = detectDynamicUsage('nothing here', [check]);
        const withMatchAgain = detectDynamicUsage('myOrgAuth();', [check]);
        expect(withMatch.detectedDynamicApis).toEqual(['myOrgAuth()']);
        expect(withoutMatch.detectedDynamicApis).toEqual([]);
        expect(withMatchAgain.detectedDynamicApis).toEqual(['myOrgAuth()']);
    });
});

describe('readExplicitDynamicValue', () => {
    it('reads a force-dynamic export', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "force-dynamic";`)).toBe('force-dynamic');
    });

    it('reads a force-static export with single quotes', () => {
        expect(readExplicitDynamicValue(`export const dynamic = 'force-static';`)).toBe('force-static');
    });

    it('reads auto and error', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "auto";`)).toBe('auto');
        expect(readExplicitDynamicValue(`export const dynamic = "error";`)).toBe('error');
    });

    it('returns null when there is no explicit export', () => {
        expect(readExplicitDynamicValue(`export default function Page() {}`)).toBeNull();
    });

    it('returns null for an unrecognized literal value', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "not-a-real-value";`)).toBeNull();
    });

    it('returns null for a commented-out export, not the value inside the comment', () => {
        expect(readExplicitDynamicValue(`// export const dynamic = "force-static";\nexport default function Page() {}`)).toBeNull();
    });
});

describe('detectDynamicUsage: getTranslations()/useTranslations() cookie-derived locale', () => {
    it('flags getTranslations(namespace) with no explicit locale and no setLocale call', () => {
        const result = detectDynamicUsage(
            `import { getTranslations } from "cloudflare-next-intl";\nexport default async function Page() {\n    const t = await getTranslations("HomePage");\n}`,
        );
        expect(result.detectedDynamicApis).toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('flags useTranslations(namespace) the same way', () => {
        const result = detectDynamicUsage(
            `import { useTranslations } from "cloudflare-next-intl";\nfunction Widget() {\n    const t = useTranslations("Widget");\n}`,
        );
        expect(result.detectedDynamicApis).toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('does not flag getTranslations(namespace, locale) — explicit locale means no cookie read', () => {
        const result = detectDynamicUsage(
            `export default async function Page({ params }) {\n    const { locale } = await params;\n    const t = await getTranslations("HomePage", locale);\n}`,
        );
        expect(result.detectedDynamicApis).not.toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('does not flag getTranslations(namespace) when setLocale(locale) runs earlier in the same file', () => {
        const result = detectDynamicUsage(
            `import { setLocale, getTranslations } from "cloudflare-next-intl";\nexport default async function Page({ params }) {\n    const { locale } = await params;\n    setLocale(locale);\n    const t = await getTranslations("HomePage");\n}`,
        );
        expect(result.detectedDynamicApis).not.toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('does not flag getTranslations(namespace) when setLocaleAsync(params) runs earlier in the same file', () => {
        const result = detectDynamicUsage(
            `import { setLocaleAsync, getTranslations } from "cloudflare-next-intl";\nexport default async function Page({ params }) {\n    await setLocaleAsync(params);\n    const t = await getTranslations("HomePage");\n}`,
        );
        expect(result.detectedDynamicApis).not.toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('ignores getTranslations() mentioned only in a comment', () => {
        const result = detectDynamicUsage(`// const t = await getTranslations("HomePage");\nexport default function Page() {}`);
        expect(result.detectedDynamicApis).not.toContain('getTranslations()/useTranslations() (cookie-derived locale)');
    });

    it('reports the correct line number for the flagged call', () => {
        const result = detectDynamicUsage(
            `import { getTranslations } from "cloudflare-next-intl";\n\nexport default async function Page() {\n    const t = await getTranslations("HomePage");\n}`,
        );
        const match = result.matches.find((m) => m.name === 'getTranslations()/useTranslations() (cookie-derived locale)');
        expect(match?.line).toBe(4);
    });
});
