import { describe, it, expect, vi } from 'vitest';
import * as ReactModule from 'react';

vi.mock('./server', () => ({
    getLocale: vi.fn(async () => 'en'),
    getMessage: vi.fn(async () => ({ Common: { title: 'Hello' } })),
}));

describe('useLocaleImpl', () => {
    it('returns the resolved locale from use(getLocale())', async () => {
        vi.spyOn(ReactModule, 'use').mockReturnValue('en');
        const { useLocaleImpl } = await import('./use_functions');
        expect(useLocaleImpl()).toBe('en');
    });

    it('throws when the resolved locale is undefined', async () => {
        vi.spyOn(ReactModule, 'use').mockReturnValue(undefined);
        const { useLocaleImpl } = await import('./use_functions');
        expect(() => useLocaleImpl()).toThrow('Please set IntlProvider before using useLocale');
    });
});

describe('useTranslations (RSC)', () => {
    it('returns a translation function when locale and messages resolve', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('en')
            .mockReturnValueOnce({ Common: { title: 'Hello' } });
        const { useTranslations } = await import('./use_functions');
        const t = useTranslations('Common');
        expect(t('title')).toBe('Hello');
    });

    it('throws when language is falsy', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('')
            .mockReturnValueOnce({ Common: {} });
        const { useTranslations } = await import('./use_functions');
        expect(() => useTranslations('Common')).toThrow('Please set IntlProvider before using useTranslations');
    });

    it('throws when messages are falsy', async () => {
        vi.spyOn(ReactModule, 'use')
            .mockReturnValueOnce('en')
            .mockReturnValueOnce(undefined);
        const { useTranslations } = await import('./use_functions');
        expect(() => useTranslations('Common')).toThrow('Please set IntlProvider before using useTranslations');
    });
});
