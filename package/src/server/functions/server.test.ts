import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookiesGet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: mockCookiesGet })),
}));

const mockNotFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
vi.mock('next/navigation', () => ({
    notFound: mockNotFound,
}));

beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCookiesGet.mockReset();
    mockNotFound.mockClear();
});

describe('getMessage', () => {
    it('loads messages for a configured locale via dynamic import', async () => {
        const { getMessage } = await import('./server');
        const messages = await getMessage('en');
        expect(messages).toMatchObject({ Common: { title: 'Hello' } });
    });

    it('throws a helpful error when a configured locale has no message file', async () => {
        vi.doMock('@intl-config', () => ({ default: { locales: ['en', 'de', 'fr'], defaultLocale: 'en' } }));
        const { getMessage } = await import('./server');
        await expect(getMessage('fr')).rejects.toThrow(/Please set localization file/);
    });

    it('calls notFound() for an unconfigured locale', async () => {
        const { getMessage } = await import('./server');
        await expect(getMessage('zz')).rejects.toThrow('NEXT_NOT_FOUND');
        expect(mockNotFound).toHaveBeenCalled();
    });

    it('returns the already-cached messages for a locale on a subsequent uncached call', async () => {
        const { getMessage, getTranslations } = await import('./server');
        await getMessage('en');
        const t = await getTranslations('Common', 'en');
        expect(t('title')).toBe('Hello');
    });

    it('always re-imports messages in dev mode instead of using the cache', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.resetModules();
        const { getMessage, getTranslations } = await import('./server');
        await getMessage('en');
        const t = await getTranslations('Common', 'en');
        expect(t('title')).toBe('Hello');
        vi.unstubAllEnvs();
    });
});

describe('getTranslations', () => {
    it('resolves messages for an explicitly passed locale', async () => {
        const { getTranslations } = await import('./server');
        const t = await getTranslations('Common', 'de');
        expect(t('title')).toBe('Hallo');
    });

    it('falls back to getLocale() when no locale argument is passed', async () => {
        mockCookiesGet.mockReturnValue({ value: 'en' });
        const { getTranslations } = await import('./server');
        const t = await getTranslations('Common');
        expect(t('title')).toBe('Hello');
    });

    // Cache-hit branch (getTranslationCache read) is covered by
    // server.perf.test.ts's "returns the cached translator function on a
    // repeat call" test — see that file for the assertion and rationale.
});

describe('getLocale', () => {
    it('returns the already-cached locale without reading cookies', async () => {
        const { setLocaleCache } = await import('../../general/cache_variables');
        setLocaleCache('de');
        const { getLocale } = await import('./server');
        expect(await getLocale()).toBe('de');
        expect(mockCookiesGet).not.toHaveBeenCalled();
    });

    it('reads the locale cookie when no locale is cached yet', async () => {
        mockCookiesGet.mockReturnValue({ value: 'de' });
        const { getLocale } = await import('./server');
        expect(await getLocale()).toBe('de');
    });

    it('falls back to defaultLocale when no cookie is present', async () => {
        mockCookiesGet.mockReturnValue(undefined);
        const { getLocale } = await import('./server');
        expect(await getLocale()).toBe('en');
    });

    it('falls back to defaultLocale and logs when cookies() throws', async () => {
        const { cookies } = await import('next/headers');
        vi.mocked(cookies).mockRejectedValueOnce(new Error('no request context'));
        const { getLocale } = await import('./server');
        expect(await getLocale()).toBe('en');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error accessing cookies'));
    });
});
