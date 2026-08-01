import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookiesGet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: mockCookiesGet })),
}));

beforeEach(() => {
    vi.resetModules();
    mockCookiesGet.mockReset();
});

describe('getMessage SSR cost', () => {
    it('loads the messages file at most once per locale across repeated calls', async () => {
        const { getMessage } = await import('./server');
        const m1 = await getMessage('en');
        const m2 = await getMessage('en');
        const m3 = await getMessage('en');

        // getMessageCache's Map returns the SAME object reference once a
        // locale's messages are loaded — this is the real SSR cost boundary:
        // the JSON import + parse happens once per locale per process, not
        // once per getMessage() call.
        expect(m2).toBe(m1);
        expect(m3).toBe(m1);
    });

    it('re-imports the messages module on every call in dev mode instead of short-circuiting on the cache', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.resetModules();

        const cacheVars = await import('../../general/cache_variables');
        const setMessageForLocaleCacheSpy = vi.spyOn(cacheVars, 'setMessageForLocaleCache');
        const { getMessage } = await import('./server');

        await getMessage('en');
        await getMessage('en');

        // iGetMessage's `isDev ? undefined : getMessageCache(locale)` guard
        // means the early-return-on-cache-hit branch (line 22-23) is never
        // taken in dev — every call falls through to the dynamic-import
        // branch, which unconditionally calls setMessageForLocaleCache again.
        expect(setMessageForLocaleCacheSpy).toHaveBeenCalledTimes(2);
        vi.unstubAllEnvs();
    });
});

describe('getTranslations SSR cost', () => {
    it('returns the cached translator function on a repeat call for the same locale/namespace', async () => {
        const { getTranslations } = await import('./server');
        const t1 = await getTranslations('Common', 'en');
        const t2 = await getTranslations('Common', 'en');

        // Exercises the getTranslationCache() read wired up in server.ts —
        // a second call with the same cacheKey must return the exact same
        // translator function instead of re-traversing messages.
        expect(t2).toBe(t1);
    });
});

describe('getLocale SSR cost', () => {
    it('reads the locale cookie at most once per module scope', async () => {
        mockCookiesGet.mockReturnValue({ value: 'en' });
        const { getLocale } = await import('./server');

        await getLocale();
        await getLocale();
        await getLocale();

        expect(mockCookiesGet).toHaveBeenCalledTimes(1);
    });
});
