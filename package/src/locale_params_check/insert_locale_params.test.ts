import { describe, it, expect } from 'vitest';
import { insertLocaleParamsSignature, insertLocaleParamsBody, ensureLocaleInParamsType, addParamsPropToExistingDestructure, ensureSetLocaleImport } from './insert_locale_params.js';

describe('insertLocaleParamsSignature', () => {
    it('adds the params prop to a zero-arg default function, real example/[locale]/[...rest]/page.tsx shape', () => {
        const source = `export default function NotFoundFallbackPage() {\n    return <div>Not found</div>;\n}`;
        const result = insertLocaleParamsSignature(source, 'locale');
        expect(result).toContain('export default function NotFoundFallbackPage({ params }: {');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
        expect(result).toContain('return <div>Not found</div>;');
    });

    it('adds the params prop to a zero-arg async default function', () => {
        const source = `export default async function Home() {\n    return null;\n}`;
        const result = insertLocaleParamsSignature(source, 'locale');
        expect(result).toContain('export default async function Home({ params }: {');
    });

    it('uses a custom localeParam name in the inserted type', () => {
        const source = `export default function Page() {}`;
        const result = insertLocaleParamsSignature(source, 'lang');
        expect(result).toContain('params: Promise<{ lang: Language }>;');
    });

    it('handles a zero-arg function with whitespace inside the parens', () => {
        const source = `export default function Page( ) {\n    return null;\n}`;
        const result = insertLocaleParamsSignature(source, 'locale');
        expect(result).toContain('export default function Page({ params }: {');
    });

    it('leaves a function that already takes a parameter untouched', () => {
        const source = `export default function Page({ params }: { params: Promise<{ locale: Language }> }) {}`;
        expect(insertLocaleParamsSignature(source, 'locale')).toBe(source);
    });

    it('leaves a non-default export untouched', () => {
        const source = `export function Helper() {}`;
        expect(insertLocaleParamsSignature(source, 'locale')).toBe(source);
    });
});

describe('insertLocaleParamsBody', () => {
    it('inserts destructure + setLocale as the first statement when no inline destructure exists', () => {
        const source = `export default function Page({ params }: {\n    params: Promise<{ locale: Language }>;\n}) {\n    return null;\n}`;
        const result = insertLocaleParamsBody(source, 'locale', false);
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        expect(result.indexOf('const { locale } = await params;')).toBeLessThan(result.indexOf('return null;'));
    });

    it('adds only setLocale(locale) when an inline destructure already exists — example/[locale]/login/page.tsx shape', () => {
        const source = `export default async function LoginPage({ params }: {\n    params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n    const { locale } = await params;\n    const t = await getTranslations("LoginPage", locale);\n}`;
        const result = insertLocaleParamsBody(source, 'locale', true);
        expect(result).toContain('const { locale } = await params;\n    setLocale(locale);');
        // Never a second `await params` read.
        expect(result.match(/await params/g)?.length).toBe(1);
    });

    it('places the added setLocale call right after the existing destructure, not at the end of the file', () => {
        const source = `export default async function LoginPage({ params }: { params: Promise<{ locale: Language }> }) {\n    const { locale } = await params;\n    const t = await getTranslations("LoginPage", locale);\n    return t("title");\n}`;
        const result = insertLocaleParamsBody(source, 'locale', true);
        expect(result.indexOf('setLocale(locale);')).toBeLessThan(result.indexOf('getTranslations'));
    });

    it('returns source unchanged if no function body start can be found and no inline destructure exists', () => {
        const source = `export const notAFunction = 5;`;
        expect(insertLocaleParamsBody(source, 'locale', false)).toBe(source);
    });

    it('returns source unchanged if hasInlineDestructure is true but no matching destructure is actually present', () => {
        const source = `export default function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    return null;\n}`;
        expect(insertLocaleParamsBody(source, 'locale', true)).toBe(source);
    });

    it('uses a custom localeParam name throughout the inserted statements', () => {
        const source = `export default function Page({ params }: { params: Promise<{ lang: Language }> }) {\n    return null;\n}`;
        const result = insertLocaleParamsBody(source, 'lang', false);
        expect(result).toContain('const { lang } = await params;');
        expect(result).toContain('setLocale(lang);');
    });
});

describe('ensureLocaleInParamsType', () => {
    it('adds locale alongside an unrelated existing key, real user-reported shape (params typed for "test", not locale)', () => {
        const source = `export default async function PropertyProfileLoading({ params }: {\n    params: Promise<{ test: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n}`;
        const result = ensureLocaleInParamsType(source, 'locale');
        expect(result).toContain('params: Promise<{ test: Language; locale: Language }>;');
    });

    it('is a no-op when the type already mentions the locale param', () => {
        const source = `export default function Page({ params }: { params: Promise<{ locale: Language }> }) {}`;
        expect(ensureLocaleInParamsType(source, 'locale')).toBe(source);
    });

    it('adds locale to an otherwise-empty params type', () => {
        const source = `export default function Page({ params }: { params: Promise<{}> }) {}`;
        const result = ensureLocaleInParamsType(source, 'locale');
        expect(result).toContain('Promise<{ locale: Language }>');
    });

    it('respects a custom localeParam name', () => {
        const source = `export default function Page({ params }: { params: Promise<{ ownerId: string }> }) {}`;
        const result = ensureLocaleInParamsType(source, 'lang');
        expect(result).toContain('params: Promise<{ ownerId: string; lang: Language }>');
    });

    it('is a no-op when there is no params: Promise<{...}> type to widen', () => {
        const source = `export default function Page() {}`;
        expect(ensureLocaleInParamsType(source, 'locale')).toBe(source);
    });
});

describe('addParamsPropToExistingDestructure', () => {
    it('adds params as a second destructured key and type property, exact user-reported repro', () => {
        const source = `export default async function PropertyProfileLoading({ test }: {\n    test: Promise<{ test: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n}`;
        const result = addParamsPropToExistingDestructure(source, 'locale');
        expect(result).toContain('{ test, params }');
        expect(result).toContain('test: Promise<{ test: Language }>; params: Promise<{ locale: Language }>;');
        // The existing "test" prop and its usage are untouched.
        expect(result).toContain("await getTranslations('PropertyIntake')");
    });

    it('never adds a second function parameter — only a second key on the existing one', () => {
        const source = `export default function Page({ test }: { test: string }) {}`;
        const result = addParamsPropToExistingDestructure(source, 'locale');
        // Exactly one top-level parameter to the function (one opening paren
        // immediately followed by one destructure, one type, one closing paren).
        expect(result.match(/\)\s*\{/g)?.length).toBe(1);
        expect(result).toMatch(/function Page\(\{ test, params \}: \{/);
    });

    it('handles a multi-line type with a nested Promise<{...}> without truncating at the inner brace', () => {
        const source = `export default async function Loading({ ownerId }: {\n    ownerId: Promise<{ ownerId: string }>;\n}) {}`;
        const result = addParamsPropToExistingDestructure(source, 'locale');
        expect(result).toContain('ownerId: Promise<{ ownerId: string }>; params: Promise<{ locale: Language }>;');
    });

    it('returns source unchanged when there is no destructured object with an inline type', () => {
        const source = `export default function Page() {}`;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when there is no default-exported function at all (arrow function export)', () => {
        const source = `const Page = () => null;\nexport default Page;`;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the source ends mid-whitespace after the open paren', () => {
        const source = `export default function Page(   `;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the destructured keys brace never closes (unbalanced source)', () => {
        const source = `export default async function Page({ test: { nested `;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('respects a custom localeParam name', () => {
        const source = `export default function Page({ test }: { test: string }) {}`;
        const result = addParamsPropToExistingDestructure(source, 'lang');
        expect(result).toContain('params: Promise<{ lang: Language }>');
    });

    it('returns source unchanged when the destructured keys are not followed by a type annotation at all', () => {
        const source = `export default function Page({ test }) {}`;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the source ends right after the destructured keys (no colon to find)', () => {
        const source = `export default function Page({ test } `;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the type annotation is a wrapped type (Readonly<{...}>), not a bare inline object', () => {
        const source = `export default function Page({ test }: Readonly<{ test: string }>) {}`;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the inline type brace never closes (unbalanced source)', () => {
        const source = `export default function Page({ test }: { test: { nested `;
        expect(addParamsPropToExistingDestructure(source, 'locale')).toBe(source);
    });

    it('does not add a duplicate comma when the destructured keys already end with a trailing comma', () => {
        const source = `export default function Page({ test, }: { test: string; }) {}`;
        const result = addParamsPropToExistingDestructure(source, 'locale');
        expect(result).toMatch(/\{ test, params \}/);
        expect(result).not.toMatch(/,\s*,/);
    });
});

describe('ensureSetLocaleImport', () => {
    it('merges setLocale into an existing named import from cloudflare-next-intl', () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default function Page() {}`;
        const result = ensureSetLocaleImport(source);
        expect(result).toContain('setLocale');
        expect(result).toMatch(/import\s*\{\s*getTranslations,\s*setLocale\s*\}\s*from\s*"cloudflare-next-intl";/);
    });

    it('does not duplicate setLocale if already imported', () => {
        const source = `import { getTranslations, setLocale } from "cloudflare-next-intl";\nexport default function Page() {}`;
        const result = ensureSetLocaleImport(source);
        expect(result.match(/setLocale/g)?.length).toBe(1);
    });

    it('adds a new import line when there is no existing cloudflare-next-intl import', () => {
        const source = `export default function Page() {}`;
        const result = ensureSetLocaleImport(source);
        expect(result.startsWith('import { setLocale } from "cloudflare-next-intl";')).toBe(true);
    });

    it('does not match setLocaleAsync as an existing setLocale import', () => {
        const source = `import { setLocaleAsync } from "cloudflare-next-intl";\nexport default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    await setLocaleAsync(params);\n}`;
        const result = ensureSetLocaleImport(source);
        expect(result).toMatch(/import\s*\{\s*setLocaleAsync,\s*setLocale\s*\}\s*from\s*"cloudflare-next-intl";/);
    });
});
