import { bench, describe, vi } from 'vitest';

const mockCookiesGet = () => ({ value: 'en' });
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: mockCookiesGet })),
}));

describe('getMessage', () => {
    bench('cold: dynamic import + cache write for an uncached locale', async () => {
        vi.resetModules();
        const { getMessage } = await import('./server');
        await getMessage('en');
    });

    bench('warm: module-scope Map cache hit for an already-loaded locale', async () => {
        const { getMessage } = await import('./server');
        await getMessage('en');
    });
});

describe('getTranslations', () => {
    bench('cold: full namespace traversal + translator build', async () => {
        vi.resetModules();
        const { getTranslations } = await import('./server');
        await getTranslations('Common', 'en');
    });

    bench('warm: translationFunctionsCache hit for repeated namespace/locale', async () => {
        const { getTranslations } = await import('./server');
        await getTranslations('Common', 'en');
        await getTranslations('Common', 'en');
    });
});

describe('getLocale', () => {
    bench('cold: reads the locale cookie', async () => {
        vi.resetModules();
        const { getLocale } = await import('./server');
        await getLocale();
    });

    bench('warm: module-scope currentLanguage cache hit', async () => {
        const { getLocale } = await import('./server');
        await getLocale();
    });
});
