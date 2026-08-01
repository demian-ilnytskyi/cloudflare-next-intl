import { describe, it, expect } from 'vitest';
import { setIntlConfig } from './init_config';

describe('setIntlConfig', () => {
    it('returns the config object unchanged (identity function)', () => {
        const input = { locales: ['en', 'fr'] as const, defaultLocale: 'en' };
        expect(setIntlConfig(input)).toBe(input);
    });
});
