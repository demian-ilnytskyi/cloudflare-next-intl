import { describe, it, expect } from 'vitest';
import { detectLocaleParams } from './detect_locale_params.js';

describe('detectLocaleParams', () => {
    it('detects setLocaleAsync(params) as full setup, real example/[locale]/page.tsx shape', () => {
        const source = `import { getTranslations, setLocaleAsync } from "cloudflare-next-intl";\nexport default async function Home({ params }: {\n  params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n  await setLocaleAsync(params);\n  const t = await getTranslations("HomePage");\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasLocaleParamSetup).toBe(true);
        expect(result.hasParamsType).toBe(true);
    });

    it('detects an inline destructure alone as NOT full setup (missing setLocale call) — example/[locale]/login/page.tsx shape', () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function LoginPage({ params }: {\n    params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n    const { locale } = await params;\n    const t = await getTranslations("LoginPage", locale);\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasInlineDestructure).toBe(true);
        expect(result.hasSetLocaleCall).toBe(false);
        expect(result.hasLocaleParamSetup).toBe(false);
    });

    it('detects inline destructure + a separate setLocale(locale) call as full setup', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    const { locale } = await params;\n    setLocale(locale);\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasLocaleParamSetup).toBe(true);
    });

    it('reports no setup at all for a zero-arg page (no params, no locale anywhere)', () => {
        const source = `export default function NotFoundFallbackPage() {\n    return <div>Not found</div>;\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasInlineDestructure).toBe(false);
        expect(result.hasSetLocaleCall).toBe(false);
        expect(result.hasLocaleParamSetup).toBe(false);
        expect(result.hasParamsType).toBe(false);
    });

    it('respects a custom localeParam name (e.g. "lang" for a [lang] folder)', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ lang: Language }> }) {\n    const { lang } = await params;\n}`;
        expect(detectLocaleParams(source, 'lang').hasInlineDestructure).toBe(true);
        expect(detectLocaleParams(source, 'locale').hasInlineDestructure).toBe(false);
    });

    it('does not treat a locale mention in a comment as real setup', () => {
        const source = `// const { locale } = await params;\nexport default function Page() {}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasInlineDestructure).toBe(false);
    });

    it('does not treat the layout.tsx "result?.locale ?? default" shape as an inline destructure', () => {
        // Real example/[locale]/layout.tsx pattern: resolves locale without
        // the `const { locale } = await params` shape this scan recognizes.
        // Documents current (conservative) behavior: reported as no setup,
        // which is safe — checkLocaleParams still won't touch a file with
        // an existing non-zero-arg params prop it doesn't fully understand.
        const source = `export default async function RootLayout({\n  children,\n  params,\n}: Readonly<{\n  children: React.ReactNode;\n  params: Promise<{ locale: string }>;\n}>) {\n  const result = await params;\n  const locale = result?.locale ?? "en";\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasInlineDestructure).toBe(false);
        expect(result.hasParamsType).toBe(true);
    });

    it('detects params type even when written across multiple lines with extra props', () => {
        const source = `export default async function Layout({ children, params }: {\n    children: React.ReactNode;\n    params: Promise<{ locale: Language }>;\n}) {}`;
        expect(detectLocaleParams(source, 'locale').hasParamsType).toBe(true);
    });

    it('detects a plain destructured { params } prop as reusable, real CRV property-profile/loading.tsx shape', () => {
        const source = `export default async function PropertyProfileLoading({ params }: {\n    params: Promise<{ locale: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasDestructuredParamsProp).toBe(true);
        expect(result.hasConflictingLocaleBinding).toBe(false);
    });

    it('detects a multi-prop { children, params } destructure as reusable too', () => {
        const source = `export default async function Layout({ children, params }: {\n    children: React.ReactNode;\n    params: Promise<{ locale: Language }>;\n}) {}`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredParamsProp).toBe(true);
    });

    it('does NOT detect an aliased { params: routeParams } as a plain destructured params prop', () => {
        const source = `export default async function Page({ params: routeParams }: { params: Promise<{ locale: Language }> }) {}`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredParamsProp).toBe(false);
    });

    it('flags a conflicting locale binding for the layout.tsx "result?.locale ?? default" shape', () => {
        const source = `export default async function RootLayout({\n  children,\n  params,\n}: Readonly<{\n  children: React.ReactNode;\n  params: Promise<{ locale: string }>;\n}>) {\n  const result = await params;\n  const locale = result?.locale ?? "en";\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasDestructuredParamsProp).toBe(true);
        expect(result.hasConflictingLocaleBinding).toBe(true);
    });

    it('flags a conflicting binding when locale is destructured some other way (not the recognized inline pattern)', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    const data = await params;\n    const { locale, extra } = someOtherHelper(data);\n}`;
        expect(detectLocaleParams(source, 'locale').hasConflictingLocaleBinding).toBe(true);
    });

    it('does not flag a conflicting binding when the recognized inline destructure is the only thing declaring it', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    const { locale } = await params;\n}`;
        expect(detectLocaleParams(source, 'locale').hasConflictingLocaleBinding).toBe(false);
    });

    it('respects a custom localeParam name for hasDestructuredParamsProp/hasConflictingLocaleBinding', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ lang: Language }> }) {\n    const lang = "hardcoded";\n}`;
        const result = detectLocaleParams(source, 'lang');
        expect(result.hasDestructuredParamsProp).toBe(true);
        expect(result.hasConflictingLocaleBinding).toBe(true);
    });

    it('detects hasDestructuredObjectWithoutParams for a props object with no params key at all, exact user-reported repro', () => {
        const source = `export default async function PropertyProfileLoading({ test }: {\n    test: Promise<{ test: Language }>;\n}): Promise<Component> {\n    const t = await getTranslations('PropertyIntake');\n}`;
        const result = detectLocaleParams(source, 'locale');
        expect(result.hasDestructuredParamsProp).toBe(false);
        expect(result.hasDestructuredObjectWithoutParams).toBe(true);
    });

    it('does NOT flag hasDestructuredObjectWithoutParams when a params key already exists (even aliased)', () => {
        const source = `export default async function Page({ params: routeParams }: { params: Promise<{ locale: Language }> }) {}`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('does NOT flag hasDestructuredObjectWithoutParams for a wrapped type (Readonly<{...}>) — left for manual edit instead', () => {
        const source = `export default async function RootLayout({\n  children,\n}: Readonly<{\n  children: React.ReactNode;\n}>) {}`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false for a zero-arg function (no destructure at all)', () => {
        const source = `export default function Page() {\n    return null;\n}`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when the destructured keys brace never closes (unbalanced source)', () => {
        const source = `export default async function Page({ test: { nested `;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when there is no default-exported function at all (arrow function export)', () => {
        const source = `const Page = () => null;\nexport default Page;`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when the source ends right after the open paren (no keys brace to find)', () => {
        const source = `export default function Page(`;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when the source ends mid-whitespace after the open paren', () => {
        const source = `export default function Page(   `;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when the source ends right after the destructured keys (no type annotation to find)', () => {
        const source = `export default function Page({ test } `;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('hasDestructuredObjectWithoutParams is false when the inline type brace never closes (unbalanced source)', () => {
        const source = `export default function Page({ test }: { test: { nested `;
        expect(detectLocaleParams(source, 'locale').hasDestructuredObjectWithoutParams).toBe(false);
    });

    it('does not treat an array destructure as a conflicting locale binding', () => {
        const source = `export default async function Page({ params }: { params: Promise<{ locale: Language }> }) {\n    const [locale] = ["en"];\n}`;
        expect(detectLocaleParams(source, 'locale').hasConflictingLocaleBinding).toBe(false);
    });
});
