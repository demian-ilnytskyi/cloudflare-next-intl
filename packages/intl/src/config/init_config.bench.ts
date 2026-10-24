import { bench, describe } from 'vitest';
import { setIntlConfig } from './init_config.js';

describe('setIntlConfig', () => {
    bench('identity pass-through of a routing config object', () => {
        setIntlConfig({ locales: ['en', 'fr'] as const, defaultLocale: 'en' });
    });
});
