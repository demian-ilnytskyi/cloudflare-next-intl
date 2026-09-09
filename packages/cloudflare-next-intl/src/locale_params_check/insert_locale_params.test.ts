import { describe, it, expect } from 'vitest';
import { insertLocaleParamsSignature, insertLocaleParamsBody, ensureLocaleInParamsType, addParamsPropToExistingDestructure, ensureSetLocaleImport, wrapSyncDefaultExportWithParams, extractParamsPromiseType } from './insert_locale_params.js';

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

describe('wrapSyncDefaultExportWithParams', () => {
    it('splits a sync zero-arg default export into a Content function plus an async wrapper — real comment/loading.tsx repro (#await-in-sync-fn build failure)', () => {
        const source = `import CommentLoading from "@/shared/components/comment/comment_loading";\n\nexport default function CommentPageLoading(): Component {\n    return <CommentLoading />;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('function CommentPageLoadingContentCloudflareNextIntl() {');
        expect(result).toContain('return <CommentLoading />;');
        expect(result).toContain('export default async function CommentPageLoading({ params }: {');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        expect(result).toContain('return <CommentPageLoadingContentCloudflareNextIntl />;');
        // The original body's own return type is dropped from the new
        // wrapper (it returns JSX, inferred fine) rather than carried over
        // verbatim onto a signature that no longer matches it.
        expect(result).not.toContain('Content(): Component');
    });

    it('marks the generated wrapper with a comment explaining it was auto-inserted and how to opt out on a later run — mirrors insertDynamicExport\'s own marker convention', () => {
        const source = `export default function Page() {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toMatch(/\/\/ Auto-inserted by cloudflare-next-intl's checkLocaleParams.*\n\s*export default async function Page/);
        expect(result).toContain("checkLocaleParams' `skip` list");
        // The comment sits directly above the wrapper only — never above
        // the untouched Content function, which isn't machine-generated
        // logic, just a renamed copy of what was already there.
        expect(result.indexOf('Auto-inserted')).toBeGreaterThan(result.indexOf('function PageContentCloudflareNextIntl'));
    });

    it('never emits a second `async` keyword and leaves an already-async zero-arg function alone', () => {
        const source = `export default async function Page() {\n    return null;\n}`;
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the default export\'s own parameter list never closes (unbalanced parens)', () => {
        const source = 'export default function Page(foo';
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });

    it('still wraps a sync function whose existing { params } prop is already typed for the locale param, when told about it via existingParamsType — this scan only skips a file entirely once it has a real inline destructure (checkLocaleParams\' hasLocaleParamSetup), not merely a matching type', () => {
        const source = `export default function Page({ params }: { params: Promise<{ locale: Language }> }) {}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale', 'locale: Language');
        expect(result).toContain('function PageContentCloudflareNextIntl({ params }: { params: Promise<{ locale: Language }> }) {}');
        expect(result).toContain('export default async function Page({ params }: {');
        // No duplicate `locale: Language` — the existing type already had it.
        expect(result.match(/locale: Language/g)?.length).toBe(2);
        expect(result).toContain('return <PageContentCloudflareNextIntl params={params} />;');
    });

    it('without existingParamsType, still resolves an existing { params } prop safely — the wrapper never duplicates `params` in its own signature, but the type it writes only knows about localeParam (the caller is expected to pass existingParamsType to preserve an unrelated key like ownerId — see check_locale_params.ts\'s canReuseExistingParams)', () => {
        const source = `export default function Page({ params }: { params: Promise<{ ownerId: string }> }) {}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('export default async function Page({ params }: {');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
        expect(result).toContain('return <PageContentCloudflareNextIntl params={params} />;');
    });

    it('leaves a non-default export untouched', () => {
        const source = `export function Helper() {}`;
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });

    it('picks a collision-free Content name when NameContentCloudflareNextIntl is already used elsewhere in the file', () => {
        const source = `import { PageContentCloudflareNextIntl } from "./page-content";\n\nexport default function Page() {\n    return <PageContentCloudflareNextIntl />;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('function PageContentCloudflareNextIntl2() {');
        expect(result).toContain('return <PageContentCloudflareNextIntl2 />;');
        // The pre-existing import and its usage inside the original body are untouched.
        expect(result).toContain('import { PageContentCloudflareNextIntl } from "./page-content";');
        expect(result).toContain('return <PageContentCloudflareNextIntl />;');
    });

    it('keeps trying suffixes until an unused name is found (PageContentCloudflareNextIntl and PageContentCloudflareNextIntl2 both taken)', () => {
        const source = `const PageContentCloudflareNextIntl = 1;\nconst PageContentCloudflareNextIntl2 = 2;\n\nexport default function Page() {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('function PageContentCloudflareNextIntl3() {');
        expect(result).toContain('return <PageContentCloudflareNextIntl3 />;');
    });

    it('uses a custom localeParam name', () => {
        const source = `export default function Page() {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'lang');
        expect(result).toContain('params: Promise<{ lang: Language }>;');
        expect(result).toContain('const { lang } = await params;');
        expect(result).toContain('setLocale(lang);');
    });

    it('preserves a doc comment attached to the original function on the new Content function', () => {
        const source = `/** Some doc. */\nexport default function Page() {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toMatch(/\/\*\* Some doc\. \*\/\s*function PageContentCloudflareNextIntl\(\) \{/);
    });

    it('preserves multi-statement bodies exactly', () => {
        const source = `export default function Page() {\n    const t = useTranslations('Page');\n    return <div>{t('title')}</div>;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain("const t = useTranslations('Page');");
        expect(result).toContain("return <div>{t('title')}</div>;");
    });
});

describe('wrapSyncDefaultExportWithParams — forwarding an existing unrelated prop (test: string)', () => {
    it('forwards a single existing destructured prop to Content by name, typed on the wrapper too (regression: a forwarded key with no type in the wrapper signature is a tsc error even though esbuild/vinext bundling lets it through silently)', () => {
        const source = `export default function Page({ test }: { test: string }) {\n    return <div>{test}</div>;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('function PageContentCloudflareNextIntl({ test }: { test: string }) {');
        expect(result).toContain('return <div>{test}</div>;');
        expect(result).toContain('export default async function Page({ test, params }: {');
        // The wrapper's OWN type must also declare `test`, not just `params`
        // — otherwise `{ test, params }` destructures a key `tsc` can't see.
        expect(result).toContain('test: string;');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        expect(result).toContain('return <PageContentCloudflareNextIntl test={test} />;');
        // Never `async` on Content, and never a second `await` there.
        expect(result).not.toContain('async function PageContentCloudflareNextIntl');
    });

    it('forwards multiple existing props in original order, each typed on the wrapper', () => {
        const source = `export default function Page({ ownerId, test }: { ownerId: string; test: string }) {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('export default async function Page({ ownerId, test, params }: {');
        expect(result).toContain('ownerId: string;');
        expect(result).toContain('test: string;');
        expect(result).toContain('return <PageContentCloudflareNextIntl ownerId={ownerId} test={test} />;');
    });

    it('carries a non-primitive forwarded type through verbatim (e.g. a union or generic)', () => {
        const source = `export default function Page({ variant }: { variant: 'a' | 'b' }) {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain("variant: 'a' | 'b';");
        expect(result).toContain('export default async function Page({ variant, params }: {');
    });

    it('returns source unchanged for a non-destructured, non-empty single argument (e.g. `(props)`) — not a plain object destructure this scan can safely forward from', () => {
        const source = 'export default function Page(props) {\n    return null;\n}';
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });

    it('returns source unchanged when the destructured keys brace never closes (unbalanced braces)', () => {
        const source = 'export default function Page({ test: string) {\n    return null;\n}';
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });

    it('forwards a rest element key by skipping it (not part of the forwarded props) and handles a default value containing a nested object', () => {
        const source = `export default function Page({ test = {}, ...rest }: { test?: object }) {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('export default async function Page({ test, params }: {');
        expect(result).toContain('return <PageContentCloudflareNextIntl test={test} />;');
    });

    it('skips whitespace between the destructured keys and the following `: {` type annotation', () => {
        const source = 'export default function Page({ test }  :  { test: string }) {\n    return null;\n}';
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('test: string;');
        expect(result).toContain('export default async function Page({ test, params }: {');
    });

    it('falls back to a params-only wrapper type when the destructure has no keys and an empty inline type (`{} : {}`)', () => {
        const source = 'export default function Page({}: {}) {\n    return null;\n}';
        const result = wrapSyncDefaultExportWithParams(source, 'locale');
        expect(result).toContain('export default async function Page({ params }: {');
        expect(result).toContain('params: Promise<{ locale: Language }>;');
    });

    it('returns source unchanged when the function body never closes (unbalanced braces)', () => {
        const source = 'export default function Page() {\n    return null;';
        expect(wrapSyncDefaultExportWithParams(source, 'locale')).toBe(source);
    });
});

describe('wrapSyncDefaultExportWithParams — reusing an existing { params } prop typed for a different key', () => {
    it('widens the wrapper\'s own params type and forwards the same params promise to Content unchanged — real property-profile/[ownerId] shape', () => {
        const source = `export default function ContractorPropertyProfileLoading({ params }: {\n    params: Promise<{ ownerId: string }>;\n}) {\n    return <div>loading</div>;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale', 'ownerId: string');
        // Content keeps its OWN { params } prop, still typed for ownerId only.
        expect(result).toContain('function ContractorPropertyProfileLoadingContentCloudflareNextIntl({ params }: {\n    params: Promise<{ ownerId: string }>;\n}) {');
        expect(result).toContain('return <div>loading</div>;');
        // The wrapper's own params type is the widened union (both keys).
        expect(result).toContain('export default async function ContractorPropertyProfileLoading({ params }: {');
        expect(result).toContain('params: Promise<{ ownerId: string; locale: Language }>;');
        expect(result).toContain('const { locale } = await params;');
        expect(result).toContain('setLocale(locale);');
        // The SAME params promise the wrapper itself awaited is re-forwarded to Content.
        expect(result).toContain('return <ContractorPropertyProfileLoadingContentCloudflareNextIntl params={params} />;');
    });

    it('never emits async on the inner Content function for the params-reuse shape', () => {
        const source = `export default function Page({ params }: { params: Promise<{ ownerId: string }> }) {\n    return null;\n}`;
        const result = wrapSyncDefaultExportWithParams(source, 'locale', 'ownerId: string');
        expect(result).not.toContain('async function PageContentCloudflareNextIntl');
    });
});

describe('extractParamsPromiseType', () => {
    it('extracts the inner type body of an existing params: Promise<{...}> type', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ ownerId: string }> }) {}`;
        expect(extractParamsPromiseType(source)).toBe('ownerId: string');
    });

    it('returns null when there is no params: Promise<{...}> type', () => {
        expect(extractParamsPromiseType('export default function Page() {}')).toBeNull();
    });
});
