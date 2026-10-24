import { describe, it, expect, vi } from 'vitest';
import * as ReactModule from 'react';
import { setTranslationCache } from '../../general/cache_variables.js';

vi.mock('./server', () => ({
    getLocale: vi.fn(async () => 'en'),
    getMessage: vi.fn(async () => ({ Common: { title: 'Hello' }, Empty: {} })),
}));

describe('useLocaleImpl', () => {
    it('returns the resolved locale from use(getLocale())', async () => {
        vi.spyOn(ReactModule, 'use').mockReturnValue('en');
        const { useLocaleImpl } = await import('./use_functions.js');
        expect(useLocaleImpl()).toBe('en');
    });

    it('throws when the resolved locale is undefined', async () => {
        vi.spyOn(ReactModule, 'use').mockReturnValue(undefined);
        const { useLocaleImpl } = await import('./use_functions.js');
        expect(() => useLocaleImpl()).toThrow('useLocale must be used within an IntlProvider');
    });
});

describe('useTranslations (RSC)', () => {
    it('returns a translation function when locale and messages resolve', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('en')
            .mockReturnValueOnce({ Common: { title: 'Hello' } });
        const { useTranslations } = await import('./use_functions.js');
        const t = useTranslations('Common');
        expect(t('title')).toBe('Hello');
    });

    it('throws when language is falsy', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('')
            .mockReturnValueOnce({ Common: {} });
        const { useTranslations } = await import('./use_functions.js');
        expect(() => useTranslations('LanguageFalsyNs')).toThrow('useTranslations must be used within an IntlProvider');
    });

    it('throws when messages are falsy', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('en')
            .mockReturnValueOnce(undefined);
        const { useTranslations } = await import('./use_functions.js');
        expect(() => useTranslations('Empty')).toThrow('useTranslations must be used within an IntlProvider');
    });

    it('returns the cached translation function without reading messages', async () => {
        setTranslationCache('en-CachedNs', (k: string) => `cached:${k}`);
        vi.spyOn(ReactModule, 'use').mockReturnValueOnce('en');
        const { useTranslations } = await import('./use_functions.js');
        const t = useTranslations('CachedNs');
        expect(t('title')).toBe('cached:title');
    });

    it('skips the translation cache in development mode', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.resetModules();
        setTranslationCache('en-DevNs', (k: string) => `cached:${k}`);
        const freshReact = await import('react');
        vi.spyOn(freshReact, 'use')
            .mockReturnValueOnce('en')
            .mockReturnValueOnce({ DevNs: { title: 'Fresh' } });
        const { useTranslations } = await import('./use_functions.js');
        const t = useTranslations('DevNs');
        expect(t('title')).toBe('Fresh');
        vi.unstubAllEnvs();
    });
});
