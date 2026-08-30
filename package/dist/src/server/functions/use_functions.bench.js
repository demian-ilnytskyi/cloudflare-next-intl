import { bench, describe, vi } from 'vitest';
import * as ReactModule from 'react';
vi.mock('./server', () => ({
    getLocale: vi.fn(async () => 'en'),
    getMessage: vi.fn(async () => ({ Common: { title: 'Hello' } })),
}));
describe('useLocaleImpl', () => {
    vi.spyOn(ReactModule, 'use').mockReturnValue('en');
    bench('resolves the locale via use(getLocale())', async () => {
        const { useLocaleImpl } = await import('./use_functions.js');
        useLocaleImpl();
    });
});
describe('useTranslations (RSC)', () => {
    vi.spyOn(ReactModule, 'use')
        .mockReturnValueOnce('en')
        .mockImplementation(() => ({ Common: { title: 'Hello' } }));
    bench('resolves locale + messages and builds a translation function', async () => {
        const { useTranslations } = await import('./use_functions.js');
        const t = useTranslations('Common');
        t('title');
    });
});
