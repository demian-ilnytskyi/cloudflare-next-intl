import { describe, it, expect } from 'vitest';
import { setIntlConfig } from './init_config.js';

describe('setIntlConfig', () => {
    it('returns the config object unchanged (identity function)', () => {
        const input = { locales: ['en', 'fr'] as const, defaultLocale: 'en' };
        expect(setIntlConfig(input)).toBe(input);
    });

    it('configures staleDeployPatterns when provided under errorHandling', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            errorHandling: {
                staleDeployPatterns: ['custom-pattern-a', 'custom-pattern-b'],
            },
        };
        const result = setIntlConfig(input);
        expect(result).toBe(input);
    });
});
