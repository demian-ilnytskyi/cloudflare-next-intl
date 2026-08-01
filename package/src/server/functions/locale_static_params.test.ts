import { describe, it, expect } from 'vitest';
import { getLocaleStaticParams } from './locale_static_params';

describe('getLocaleStaticParams', () => {
    it('returns one { locale } object per configured locale', () => {
        expect(getLocaleStaticParams()).toEqual([{ locale: 'en' }, { locale: 'de' }]);
    });
});
